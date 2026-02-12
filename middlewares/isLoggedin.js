const jwt = require("jsonwebtoken");
const alumniModel = require("../models/alumni-model");
const studentModel = require("../models/student-model");
const collegeModel = require("../models/college-model");

module.exports = async function (req, res, next) {
  // Check if a token exists in the user's cookies. If not, they are not logged in.
  if (!req.cookies.token) {
    req.flash("error", "You need to login first");
    return res.redirect("/");
  }

  try {
    // Verify the token using the secret key to get the decoded payload.
    const decoded = jwt.verify(req.cookies.token, process.env.JWT_KEY);

    // Determine which user model to query based on the 'role' stored in the token.
    let Model;
    if (decoded.role === "alumni") Model = alumniModel;
    else if (decoded.role === "student") Model = studentModel;
    else if (decoded.role === "college") Model = collegeModel;
    else {
      req.flash("error", "Invalid user role");
      return res.redirect("/");
    }

    // Find the user in the database using the email from the token.
    const user = await Model.findOne({ email: decoded.email }).select("-password");

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/");
    }

    // Attach the user object to the request.
    req.user = user;

    // =========================================================
    // MANDATORY ONBOARDING CHECK
    // =========================================================
    // If a student or alumnus hasn't completed their AI features, force redirect.
    // We allow access if they are already on the completion page or trying to logout.
    const isAuthRoute = req.path === '/auth/complete-profile' || req.path.includes('/logout');

    if ((user.role === "student" || user.role === "alumni") && !user.isProfileComplete && !isAuthRoute) {
      req.flash("info", "Please complete your profile to access the platform.");
      return res.redirect("/auth/complete-profile");
    }

    next();
  } catch (err) {
    console.error("Middleware Error:", err.message);
    req.flash("error", "Something went wrong with your session.");
    res.redirect("/");
  }
};