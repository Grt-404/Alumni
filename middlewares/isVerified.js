// middleware/isVerified.js
module.exports = function (req, res, next) {
    // 1. Check if req.user was set by the preceding middleware (isLoggedIn)
    if (!req.user) {
        // This shouldn't happen if isLoggedIn runs first, but is a safe fallback
        req.flash("error", "Authentication failed. Please log in again.");
        return res.redirect("/");
    }

    // Colleges do not have a verification status, so they can proceed.
    if (req.user.role === 'college') {
        return next();
    }

    // 2. Check the user's status for rejection or pending
    if (req.user.status === "Pending" || req.user.status === "Rejected") {
        // If the user is NOT Verified, prevent them from accessing the route.
        // The dashboard for each role is designed to show a status modal.
        req.flash(
            "error",
            `Your account is currently ${req.user.status}. You cannot access this page yet.`
        );

        // Redirect to their specific dashboard based on their role.
        return res.redirect(`/${req.user.role}/dashboard`);
    }

    // 3. If the status is 'Verified', allow the request to continue
    next();
};
