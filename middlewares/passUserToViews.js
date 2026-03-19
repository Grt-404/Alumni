const jwt = require('jsonwebtoken');
const alumniModel = require('../models/alumni-model');
const studentModel = require('../models/student-model');
const collegeModel = require('../models/college-model');

async function passUserToViews(req, res, next) {
    res.locals.user = null;
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
                    res.locals.user = user;
                }
            }
        }
    } catch (err) {

        console.warn("PassUserToViews Middleware: Invalid or expired token.");
    }
    next();
}

module.exports = passUserToViews;