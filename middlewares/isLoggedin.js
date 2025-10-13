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
      // If the role is invalid, deny access.
      req.flash("error", "Invalid user role");
      return res.redirect("/");
    }

    // Find the user in the database using the email from the token.
    // The full user document, including the 'college' ID, will be fetched.
    const user = await Model.findOne({ email: decoded.email }).select(
      "-password"
    );

    // If no user is found with that email, the token is invalid.
    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/");
    }

    // Attach the complete user object (including 'college' ID) to the request object.
    // This makes it available to all subsequent routes.
    req.user = user;
    next();
  } catch (err) {
    // Handle errors like an expired or malformed token.
    console.error(err.message);
    req.flash("error", "Something went wrong");
    res.redirect("/");
  }
};
