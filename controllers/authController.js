// controllers/authController.js
const alumniModel = require("../models/alumni-model");
const collegeModel = require("../models/college-model");
const studentModel = require("../models/student-model");
const bcrypt = require("bcrypt");
const { generateToken } = require("../utils/generateToken");
const axios = require("axios");
const { fetchLinkedInProfile } = require("../utils/fetchLinkedinProfile");

async function fetchImageBuffer(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data, "binary");
  } catch (error) {
    console.error(`Failed to fetch image buffer: ${error.message}`);
    return null;
  }
}

const cookieOptions = {
  expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  httpOnly: true,
};

module.exports.loginUser = async function (req, res) {
  try {
    const { email, password } = req.body;

    let user =
      (await alumniModel.findOne({ email })) ||
      (await collegeModel.findOne({ email })) ||
      (await studentModel.findOne({ email }));

    if (!user || !(await bcrypt.compare(password, user.password))) {
      req.flash("error", "Email or password is incorrect");
      return res.redirect("/login");
    }

    if (user.role === "alumni" && user.linkedin) {
      await scrapeAndEnrichProfile(user._id, user.linkedin);
    }

    let token = generateToken(user);
    res.cookie("token", token, cookieOptions);

    // Redirect logic based on profile completion
    if (user.role !== "college" && !user.isProfileComplete) {
      return res.redirect("/auth/complete-profile");
    }

    res.redirect(`/${user.role}/dashboard`);
  } catch (err) {
    console.error("Login error:", err.message);
    req.flash("error", "Server Error");
    return res.redirect("/login");
  }
};

module.exports.logout = function (req, res, next) {
  res.cookie("token", "");
  res.redirect("/");
};

async function scrapeAndEnrichProfile(userId, profileUrl) {
  try {
    const scrapedData = await fetchLinkedInProfile(profileUrl);
    if (scrapedData) {
      const updates = {
        name: scrapedData.fullName || undefined,
        bio: scrapedData.summary,
        location: scrapedData.geoFull,
      };

      if (scrapedData.positions && scrapedData.positions.length > 0) {
        const currentPosition = scrapedData.positions[0];
        updates.currentCompany = currentPosition.companyName;
        updates.designation = currentPosition.title;
      }

      if (scrapedData.profilePicture) {
        updates.image = await fetchImageBuffer(scrapedData.profilePicture);
      }

      await alumniModel.findByIdAndUpdate(userId, { $set: updates });
    }
  } catch (error) {
    console.error(`Background scrape failed:`, error);
  }
}

module.exports.registerUser = async function (req, res) {
  try {
    const { email, fullname, password, role, linkedin, college } = req.body;

    let Model;
    if (role === "alumni") Model = alumniModel;
    else if (role === "college") Model = collegeModel;
    else if (role === "student") Model = studentModel;
    else {
      req.flash("error", "Invalid role selected");
      return res.redirect("/register");
    }

    let existingUser = await Model.findOne({ email });
    if (existingUser) {
      req.flash("error", "Account already exists, please login");
      return res.redirect("/login");
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const userData = {
      email,
      password: hash,
      role,
      points: 0,
      college: college,
      isProfileComplete: false // Initialize as false for mandatory onboarding
    };

    if (role === "alumni") {
      userData.name = fullname;
      if (linkedin) userData.linkedin = linkedin;
    } else {
      userData.fullname = fullname;
    }

    const createdUser = await Model.create(userData);

    if (role === "alumni" && createdUser.linkedin) {
      scrapeAndEnrichProfile(createdUser._id, createdUser.linkedin);
    }

    if ((role === "student" || role === "alumni") && college) {
      const userRoleField = role === "student" ? "students" : "alumni";
      await collegeModel.findByIdAndUpdate(college, {
        $push: { [userRoleField]: createdUser._id },
      });
    }

    const token = generateToken(createdUser);
    res.cookie("token", token, cookieOptions);

    // Always redirect new students/alumni to complete profile
    return res.redirect("/auth/complete-profile");
  } catch (err) {
    console.error("Registration error:", err);
    req.flash("error", "Server Error");
    return res.redirect("/register");
  }
};

module.exports.redirectToLinkedIn = (req, res) => {
  const { role } = req.params;
  const state = role;
  const linkedInUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${process.env.LINKEDIN_CALLBACK_URL}&state=${state}&scope=openid%20profile%20email`;
  res.redirect(linkedInUrl);
};

module.exports.handleLinkedInCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const role = state;
    let Model = role === "alumni" ? alumniModel : studentModel;

    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const accessToken = tokenResponse.data.access_token;

    const userInfoResponse = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const userInfo = userInfoResponse.data;

    let user = await Model.findOne({ $or: [{ linkedinId: userInfo.sub }, { email: userInfo.email }] });

    if (!user) {
      const profileData = {
        email: userInfo.email,
        linkedinId: userInfo.sub,
        role,
        status: "Verified",
        isProfileComplete: false
      };
      if (role === "student") profileData.fullname = userInfo.name;
      else profileData.name = userInfo.name;

      if (userInfo.picture) profileData.image = await fetchImageBuffer(userInfo.picture);

      user = await Model.create(profileData);
      const token = generateToken(user);
      res.cookie("token", token, cookieOptions);
      return res.redirect("/auth/complete-profile");
    }

    const token = generateToken(user);
    res.cookie("token", token, cookieOptions);

    if (!user.isProfileComplete) return res.redirect("/auth/complete-profile");
    return res.redirect(`/${role}/dashboard`);
  } catch (error) {
    req.flash("error", "LinkedIn Authentication Failed");
    return res.redirect("/login");
  }
};

module.exports.renderCompleteProfile = async (req, res) => {
  try {
    const colleges = await collegeModel.find({});
    res.render("complete-login", { user: req.user, colleges: colleges });
  } catch (error) {
    res.redirect("/login");
  }
};

/**
 * MANDATORY PROFILE COMPLETION
 * Processes AI features for the Siamese Recommender
 */
module.exports.completeProfile = async (req, res) => {
  try {
    const {
      password, linkedin, college, age, gender,
      objectives, constraints, industry, seniority,
      companySize, branch, interests
    } = req.body;

    const Model = req.user.role === "alumni" ? alumniModel : studentModel;
    const user = await Model.findById(req.user._id);

    if (college) user.college = college;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    // AI Recommender Features
    user.age = Number(age);
    user.gender = gender;
    user.objectives = objectives;
    user.constraints = constraints || "None";

    if (user.role === "student") {
      user.branch = branch;
      user.interests = Array.isArray(interests) ? interests : interests.split(',').map(i => i.trim());
    } else {
      user.industry = industry;
      user.seniority = seniority;
      user.companySize = Number(companySize);
      if (linkedin) {
        user.linkedin = linkedin;
        scrapeAndEnrichProfile(user._id, user.linkedin);
      }
    }

    user.isProfileComplete = true; // Mark as done
    await user.save();

    if (college) {
      const field = user.role === "student" ? "students" : "alumni";
      await collegeModel.findByIdAndUpdate(college, { $addToSet: { [field]: user._id } });
    }

    req.flash("success", "Profile Complete! Explore your AI matches.");
    res.redirect(`/${user.role}/dashboard`);
  } catch (error) {
    res.redirect("/auth/complete-profile");
  }
};