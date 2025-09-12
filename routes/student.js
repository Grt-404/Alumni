const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const isLoggedIn = require("../middlewares/isLoggedin");

const EventRequest = require("../models/eventRequest-model");
const Student = require("../models/student-model");

router.get("/register", (req, res) => {
    res.render("register-student");
});


router.post("/register", (req, res) => {
    req.body.role = "student";
    authController.registerUser(req, res);
});
router.get("/dashboard", (req, res) => {
    res.render("student-dashboard");
})
router.get("/login", (req, res) => {
    res.render("login-student");
});

router.post("/login", (req, res) => {
    req.body.role = "student";
    authController.loginUser(req, res);
});

router.get("/eventrequest" , (req,res)=>{
    res.render("eventrequest");
})

router.post("/eventrequest", isLoggedIn, async (req, res) => {
  try {
    const { title, description } = req.body;
    const requestedBy = req.user._id;  // Now req.user exists

    const eventRequest = new EventRequest({ title, description, requestedBy });
    await eventRequest.save();

    res.redirect("/student/events");
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.post("/:id/upvote", isLoggedIn, async (req, res) => {
  try {
    const event = await EventRequest.findById(req.params.id);
    if (!event) return res.redirect("/student/events");

    const userId = req.user._id.toString();

    // no self upvote
    if (event.requestedBy.toString() === userId) return res.redirect("/student/events");

    // check if already upvoted
    if (event.upvotedBy.some(u => u.toString() === userId)) {
      return res.redirect("/student/events");
    }

    event.upvotes += 1;
    event.upvotedBy.push(req.user._id);

    if (event.upvotes >= 10) event.status = "approved";

    await event.save();
    res.redirect("/student/events");
  } catch (err) {
    console.error(err);
    res.redirect("/student/events");
  }
});




router.get("/events", isLoggedIn, async (req, res) => {
  try {
    const events = await EventRequest.find().populate("requestedBy", "fullname");
    res.render("student-event", { events, currentUser: req.user }); 
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
