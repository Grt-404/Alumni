const express = require('express');
const router = express.Router();
const isLoggedin = require('../middlewares/isLoggedin');
const alumniModel = require("../models/alumni-model");
const collegeModel = require('../models/college-model');
const studentModel = require('../models/student-model');
const passport = require('passport');
const authController = require("../controllers/authController");

router.get("/", (req, res) => {
    res.render("home");
})
router.get("/login", (req, res) => {
    res.render("login");
})
router.post("/login", (req, res) => {
    authController.loginUser(req, res);
});
router.get("/register", (req, res) => {
    res.render("signup");
});

router.get('/auth/complete-profile', isLoggedin, authController.renderCompleteProfile);

router.post('/auth/complete-profile', isLoggedin, authController.completeProfile);

router.get('/auth/linkedin/callback', authController.handleLinkedInCallback);
router.get('/auth/linkedin/:role', authController.redirectToLinkedIn);





router.get("/logout", authController.logout);
module.exports = router;