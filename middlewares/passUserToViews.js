const jwt = require('jsonwebtoken');
const alumniModel = require('../models/alumni-model');
const studentModel = require('../models/student-model');
const collegeModel = require('../models/college-model');

async function passUserToViews(req, res, next) {
    res.locals.user = null; // Start with no user
    try {
        const token = req.cookies.token;
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_KEY);
            let Model;
            if (decoded.role === 'alumni') Model = alumniModel;
            else if (decoded.role === 'student') Model = studentModel;
            else if (decoded.role === 'college') Model = collegeModel;

            if (Model) {
                const user = await Model.findById(decoded.id).select("-password");
                if (user) {
                    res.locals.user = user; // Make user object available in all EJS files
                }
            }
        }
    } catch (err) {
        // If token is invalid or expired, just ignore it
        console.warn("PassUserToViews Middleware: Invalid or expired token.");
    }
    next(); // Continue to the next route
}

module.exports = passUserToViews;