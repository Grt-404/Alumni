const alumniModel = require('../models/alumni-model');
const collegeModel = require('../models/college-model');
const studentModel = require('../models/student-model');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/generateToken');
const axios = require('axios');
const { fetchLinkedInProfile } = require('../utils/fetchLinkedinProfile');

async function fetchImageBuffer(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (error) {
        console.warn(`Could not fetch LinkedIn profile image: ${error.message}`);
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

        // --- Basic validation ---
        if (!code || !state) {
            console.error("LinkedIn callback missing code or state:", req.query);
            req.flash("error", "Invalid LinkedIn callback.");
            return res.redirect("/login");
        }

        const role = state; // role should be 'alumni' or 'student'
        let Model;

        if (role === "alumni") Model = alumniModel;
        else if (role === "student") Model = studentModel;
        else {
            console.error("Invalid role received from LinkedIn:", state);
            req.flash("error", "Invalid user role received from LinkedIn.");
            return res.redirect("/login");
        }

        // --- Exchange authorization code for access token ---
        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
                client_id: process.env.LINKEDIN_CLIENT_ID,
                client_secret: process.env.LINKEDIN_CLIENT_SECRET,
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error("No access token received from LinkedIn");

        // --- Fetch user profile from LinkedIn ---
        const userInfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const userInfo = userInfoResponse.data;

        // --- Prepare profile data ---
        const profileData = {
            linkedinId: userInfo.sub,
            email: userInfo.email,
            role,
            status: 'pending'
        };

        if (role === 'student') profileData.fullname = userInfo.name;
        else profileData.name = userInfo.name;

        if (typeof userInfo.picture === 'string' && userInfo.picture.startsWith('http')) {
            profileData.image = await fetchImageBuffer(userInfo.picture);
        }

        // --- Check if user exists ---
        let user = await Model.findOne({ linkedinId: profileData.linkedinId });

        if (user) {
            // Existing LinkedIn user: update profile
            if (role === 'student') user.fullname = profileData.fullname;
            else user.name = profileData.name;

            if (profileData.image) user.image = profileData.image;
            await user.save();
        } else {
            // No LinkedIn ID found, check by email
            user = await Model.findOne({ email: profileData.email });

            if (user) {
                // Link existing account with LinkedIn
                user.linkedinId = profileData.linkedinId;
                if (role === 'student') user.fullname = profileData.fullname;
                else user.name = profileData.name;
                if (profileData.image) user.image = profileData.image;
                await user.save();
            } else {
                // Brand new user: create account
                user = await Model.create(profileData);
                // Redirect new users to complete profile
                const token = generateToken(user);
                res.cookie("token", token);
                return res.redirect('/auth/complete-profile');
            }
        }

        // --- For existing users, log them in and redirect to dashboard ---
        const token = generateToken(user);
        res.cookie("token", token);
        return res.redirect(`/${role}/dashboard`);

    } catch (error) {
        console.error("Error during LinkedIn OAuth callback:", error.response?.data || error.message);
        req.flash("error", "Failed to authenticate with LinkedIn.");
        return res.redirect("/login");
    }
};





module.exports.renderCompleteProfile = (req, res) => {
    res.render('complete-login', { user: req.user });
};


module.exports.completeProfile = async (req, res) => {
    try {
        const { password, linkedin } = req.body;
        const user = await (req.user.role === 'alumni' ? alumniModel : studentModel).findById(req.user._id);

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect('/login');
        }

        // Hash and save the new password
        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // If alumnus and linkedin URL is provided, save it and trigger scrape
        if (user.role === 'alumni' && linkedin) {
            user.linkedin = linkedin;
            // Scrape in the background
            scrapeAndEnrichProfile(user._id, user.linkedin, user.role);
        }

        await user.save();
        
        req.flash("success", "Your profile is complete!");
        res.redirect(`/${user.role}/dashboard`);

    } catch (error) {
        console.error("Error completing profile:", error);
        req.flash("error", "There was a problem completing your profile.");
        res.redirect('/login');
    }
};