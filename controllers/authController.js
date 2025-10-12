const alumniModel = require('../models/alumni-model');
const collegeModel = require('../models/college-model');
const studentModel = require('../models/student-model');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/generateToken');
const axios = require('axios');
const { fetchLinkedInProfile } = require('../utils/fetchLinkedinProfile');

async function fetchImageBuffer(url) {
  
  console.log(`Attempting to download image from: ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error(`Failed to fetch image buffer from ${url}. Error: ${error.message}`);
    return null;
  }
}



module.exports.loginUser = async function (req, res) {
    try {
        const { email, password } = req.body;

        let user = await alumniModel.findOne({ email }) ||
            await collegeModel.findOne({ email }) ||
            await studentModel.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.flash("error", "Email or password is incorrect");
            return res.redirect("/login");
        }

        
        if (user.role === "alumni" && user.linkedin) {
            console.log(`Login successful. Scraping profile before redirect...`);
            await scrapeAndEnrichProfile(user._id, user.linkedin);
            console.log(`Scrape finished.`);
        }

        // Generate token and redirect
        let token = generateToken(user);
        res.cookie("token", token);
        const role = user.role;
        res.redirect(`/${role}/dashboard`);

    } catch (err) {
        console.error("Login error:", err.message);
        req.flash("error", "Server Error");
        return res.redirect("/login");
    }
};

module.exports.logout = function (req, res, next) {
    // Note: req.logout() is from passport, so we remove it for now.
    res.cookie("token", ""); 
    res.redirect('/');
};




// ...

async function scrapeAndEnrichProfile(userId, profileUrl) {
    try {
        console.log(`Starting background scrape for user: ${userId}`);
        const scrapedData = await fetchLinkedInProfile(profileUrl);

        if (scrapedData) {
            const updates = {
                // Use the more accurate full name if available
                name: scrapedData.fullName || undefined,
                bio: scrapedData.summary,
                location: scrapedData.geoFull,
            };
            
            // Get current position details
            if (scrapedData.positions && scrapedData.positions.length > 0) {
                const currentPosition = scrapedData.positions[0];
                updates.currentCompany = currentPosition.companyName;
                updates.designation = currentPosition.title;
            }

            // Get profile picture
            if (scrapedData.profilePicture) {
                updates.image = await fetchImageBuffer(scrapedData.profilePicture);
            }
            
            // Update the user in the database
            await alumniModel.findByIdAndUpdate(userId, { $set: updates });
            console.log(`Successfully enriched profile for user: ${userId}`);
        }
    } catch (error) {
        console.error(`Background scrape failed for user ${userId}:`, error);
    }
}



module.exports.registerUser = async function (req, res) {
    try {
        const { email, fullname, password, role, linkedin } = req.body;

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
            req.flash("error", "You already have an account, please login");
            return res.redirect("/login");
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Basic user data
        const userData = {
            email,
            password: hash,
            role,
            points: 0 
        };

        if (role === "alumni") {
            userData.name = fullname;
            if (linkedin) {
                userData.linkedin = linkedin;
            }
        } else {
            userData.fullname = fullname;
        }

        
        const createdUser = await Model.create(userData);

       
        if (role === "alumni" && createdUser.linkedin) {
            scrapeAndEnrichProfile(createdUser._id, createdUser.linkedin);
        }

        
        const token = generateToken(createdUser);
        res.cookie("token", token);
        return res.redirect(`/${role}/dashboard`);

    } catch (err) {
        
        console.error("Full registration error:", err);
        req.flash("error", "Server Error");
        return res.redirect("/register");
    }
};

module.exports.redirectToLinkedIn = (req, res) => {
    const { role } = req.params;
    if (role !== 'alumni' && role !== 'student') {
        req.flash("error", "Invalid user role for LinkedIn login.");
        return res.redirect('/register');
    }
    const state = role;
    const linkedInUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${process.env.LINKEDIN_CALLBACK_URL}&state=${state}&scope=openid%20profile%20email`;
    res.redirect(linkedInUrl);
};

module.exports.handleLinkedInCallback = async (req, res) => {
    try {
        const { code, state } = req.query;
        const role = state;
        let Model;
        if (role === "alumni") Model = alumniModel;
        else if (role === "student") Model = studentModel;
        else {
            req.flash("error", "Invalid user role received from LinkedIn.");
            return res.redirect('/login');
        }

        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: { grant_type: 'authorization_code', code, redirect_uri: process.env.LINKEDIN_CALLBACK_URL, client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET, },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const accessToken = tokenResponse.data.access_token;

        const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const userInfo = userInfoResponse.data;
        
        const profileData = { email: userInfo.email, linkedinId: userInfo.sub, image: null };
        if (role === 'student') profileData.fullname = userInfo.name;
        else profileData.name = userInfo.name;
        
        if (typeof userInfo.picture === 'string' && userInfo.picture.startsWith('http')) {
            profileData.image = await fetchImageBuffer(userInfo.picture);
        }
        
        let user = await Model.findOne({ linkedinId: profileData.linkedinId });

        if (user) {
            if (role === 'student') user.fullname = profileData.fullname;
            else user.name = profileData.name;
            if (profileData.image) user.image = profileData.image;
            await user.save();
        } else {
            user = await Model.findOne({ email: profileData.email });
            if (user) {
                user.linkedinId = profileData.linkedinId;
                if (role === 'student') user.fullname = profileData.fullname;
                else user.name = profileData.name;
                if (profileData.image) user.image = profileData.image;
                await user.save();
            } else {
                const newUserData = { ...profileData, role, status: 'Pending' };
                user = await Model.create(newUserData);
            }
        }
        
        const token = generateToken(user);
        res.cookie("token", token);
        res.redirect(`/${role}/dashboard`);
    } catch (error) {
        console.error("Error during LinkedIn OAuth callback:", error.response ? error.response.data : error.message);
        req.flash("error", "Failed to authenticate with LinkedIn.");
        res.redirect("/login");
    }
};