
module.exports = function (req, res, next) {

    if (!req.user) {

        req.flash("error", "Authentication failed. Please log in again.");
        return res.redirect("/");
    }


    if (req.user.role === 'college') {
        return next();
    }


    if (req.user.status === "Pending" || req.user.status === "Rejected") {
        req.flash(
            "error",
            `Your account is currently ${req.user.status}. You cannot access this page yet.`
        );

        return res.redirect(`/${req.user.role}/dashboard`);
    }


    next();
};
