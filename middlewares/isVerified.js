// middleware/isVerified.js (The correct implementation)
module.exports = function (req, res, next) {
    // 1. Check if req.user was set by the preceding middleware (isLoggedIn)
    if (!req.user) {
        // This shouldn't happen if isLoggedIn runs first, but is a safe fallback
        req.flash("error", "Authentication failed. Please log in again.");
        return res.redirect("/");
    }

    // 2. Check the user's status for rejection or pending
    if (req.user.status === "Pending" || req.user.status === "Rejected") {
        // If the user is NOT Verified, prevent them from accessing the route
        req.flash(
            "error",
            `Your account is currently ${req.user.status}. You cannot update your profile yet.`
        );

        // Redirect to a status page or the dashboard, NOT the root login page
        return res.redirect("/alumni/dashboard"); // Change this to your dedicated status page
    }

    // 3. If the status is 'Verified', allow the request to continue
    next();
};