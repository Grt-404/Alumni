const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const isLoggedIn = require("../middlewares/isLoggedin");
const Post = require("../models/post-model");
const Message = require('../models/message-model');
const EventRequest = require("../models/eventRequest-model");
const Student = require("../models/student-model");
const Alumni = require("../models/alumni-model");
const Event = require("../models/event-model");
const multer = require("multer");
const upload = multer();

// routes/student.js

// ROUTE TO SEND A CONNECTION REQUEST
router.post('/connect/:alumniId', isLoggedIn, async (req, res) => {
  try {
    const studentId = req.user._id;
    const alumniId = req.params.alumniId;

    const student = await Student.findById(studentId);
    const alumni = await Alumni.findById(alumniId);

    // --- NEW FIX: CHECK IF STUDENT AND ALUMNI EXIST ---
    if (!student) {
      return res.status(404).json({ error: "Logged-in student not found." });
    }
    if (!alumni) {
      return res.status(404).json({ error: "Alumni not found." });
    }

    // --- VALIDATION ---
    // 1. Check if a request was already sent
    if (student.sentRequests.includes(alumniId) || alumni.invitations.includes(studentId)) {
      return res.status(400).json({ error: 'Connection request already sent.' });
    }
    // 2. Check if they are already connected
    if (student.connections.includes(alumniId) || alumni.connections.includes(studentId)) {
      return res.status(400).json({ error: 'You are already connected.' });
    }

    // --- UPDATE MODELS ---
    student.sentRequests.push(alumniId);
    alumni.invitations.push(studentId);

    await student.save();
    await alumni.save();

    res.status(200).json({ message: 'Connection request sent successfully!' });

  } catch (error) {
    console.error("Error sending connection request:", error);
    res.status(500).json({ error: 'Server error' });
  }
});
router.get("/register", (req, res) => {
  res.render("register-student");
});
router.get('/chat/:recipientId', isLoggedIn, async (req, res) => {
  try {
    // 1. Get the logged-in student and their list of connections
    const student = await Student.findById(req.user._id).populate('connections');

    // 2. Get the profile of the alumni they want to chat with
    const recipient = await Alumni.findById(req.params.recipientId);

    // 3. SECURITY CHECK: Make sure the recipient exists and is in the student's connection list.
    // The .some() method checks if at least one connection's ID matches the recipient's ID.
    if (!recipient || !student.connections.some(conn => conn._id.equals(recipient._id))) {
      console.log("Chat access denied: User is not a connection.");
      // If they aren't connected, redirect them away.
      return res.redirect('/student/connections');
    }

    // 4. Fetch the chat history between these two specific users
    const messages = await Message.find({
      $or: [
        { from: student._id, to: recipient._id },
        { from: recipient._id, to: student._id }
      ]
    }).sort({ createdAt: 'asc' }); // Sort messages by oldest first

    // 5. Render the chat page and pass all necessary data
    res.render('chat', {
      user: req.user,                  // For identifying the sender in the UI
      connections: student.connections, // For the sidebar list
      activeChat: recipient,           // To show who the current chat is with
      messages: messages               // The conversation history
    });

  } catch (error) {
    console.error("Error loading chat page:", error);
    res.redirect('/student/dashboard');
  }
});
router.post("/register", (req, res) => {
  req.body.role = "student";
  authController.registerUser(req, res);
});
// routes/student.js

// ... your other routes

// ROUTE TO DISPLAY THE CONNECTIONS PAGE (Corrected)
router.get('/connections', isLoggedIn, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('connections');

    // --- FIX: Add a check to ensure the student exists ---
    if (!student) {
      console.error(`Connections page error: Student not found with ID: ${req.user._id}`);
      req.flash('error', 'Your session has expired. Please log in again.');
      return res.redirect('/login'); // Redirect to a safe login page
    }

    res.render('connections', {
      user: req.user,
      connections: student.connections
    });

  } catch (error) {
    console.error("Error fetching connections:", error);
    // Also handle generic errors by redirecting
    req.flash('error', 'An error occurred while loading your connections.');
    res.redirect('/student/dashboard');
  }
});

// ... rest of your routes
router.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const posts = await Post.find().populate("author");
    const AlumniList = await Alumni.find({ status: "Verified" }).sort({ createdAt: -1 })

    const today = new Date();

    const events = await Event.find({ date: { $gte: today } }).sort({
      date: 1,
    }).limit(3);

    res.render("student-dashboard", {
      user: req.user,
      posts,
      AlumniList,
      events
    });
  } catch (err) {
    console.error("❌ Error loading dashboard:", err);
    res.status(500).send("Server Error");
  }
});

router.get("/login", (req, res) => {
  res.render("login-student");
});

router.post("/login", (req, res) => {
  req.body.role = "student";
  authController.loginUser(req, res);
});

router.get("/eventrequest", (req, res) => {
  res.render("eventrequest");
});

router.post("/eventrequest", isLoggedIn, async (req, res) => {
  try {
    const { title, description } = req.body;
    const requestedBy = req.user._id; // Now req.user exists

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
    if (event.requestedBy.toString() === userId)
      return res.redirect("/student/events");

    // check if already upvoted
    if (event.upvotedBy.some((u) => u.toString() === userId)) {
      return res.redirect("/student/events");
    }

    event.upvotes += 1;
    event.upvotedBy.push(req.user._id);

    await event.save();
    res.redirect("/student/events");
  } catch (err) {
    console.error(err);
    res.redirect("/student/events");
  }
});

router.get("/events", isLoggedIn, async (req, res) => {
  try {
    const events = await EventRequest.find().populate(
      "requestedBy",
      "fullname"
    );
    res.render("student-event", { events, currentUser: req.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/posts", isLoggedIn, async (req, res) => {
  try {
    const posts = await Post.find().populate("author");
    res.render("studenAlumPost", {
      user: req.user,
      posts,
    });
  } catch (err) {
    console.error("❌ Error loading dashboard:", err);
    res.status(500).send("Server Error");
  }
});

router.get("/referrals", isLoggedIn, async (req, res) => {
  const student = await Student.findById(req.user._id)
    .populate('connections');

  res.render("studentRef", {
    user: req.user,
    connections: student.connections
  })
})

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.get("/map", isLoggedIn, async (req, res) => {
  try {
    // 1. Fetch all alumni with a location specified to display in the sidebar
    const alumniData = await Alumni.find({
      _id: { $ne: req.user._id },
    });

    // 2. Render the view immediately without location data for the map.
    // The locations will be fetched via WebSocket after the page loads.
    res.render("map", {
      user: req.user,
      alumniList: alumniData,
    });
  } catch (err) {
    console.error("Error loading alumni map page:", err)
    res.redirect('/student/dashboard');
  }
});



router.post('/connect/:alumniId', isLoggedIn, async (req, res) => {
  try {
    const studentId = req.user._id;
    const alumniId = req.params.alumniId;
    const student = await Student.findById(studentId);
    const alumni = await Alumni.findById(alumniId);
    if (!student || !alumni) {
      return res.status(404).json({ error: "User not found." });
    }
    if (student.sentRequests.includes(alumniId) || alumni.invitations.includes(studentId)) {
      return res.status(400).json({ error: 'Connection request already sent.' });
    }
    if (student.connections.includes(alumniId) || alumni.connections.includes(studentId)) {
      return res.status(400).json({ error: 'You are already connected.' });
    }
    student.sentRequests.push(alumniId);
    alumni.invitations.push(studentId);
    await student.save();
    await alumni.save();
    res.status(200).json({ message: 'Connection request sent successfully!' });
  } catch (error) {
    console.error("Error sending connection request:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate({
        path: 'connections',
        select: 'name designation currentCompany image'
      });

    const eventRequests = await EventRequest.find({ requestedBy: req.user._id })
      .sort({ createdAt: -1 });

    if (!student) {
      req.flash('error', 'Could not find your profile. Please log in again.');
      return res.redirect('/student/login');
    }

    res.render('studentProfile', {
      user: student,
      connections: student.connections,
      eventRequests: eventRequests
    });
  } catch (error) {
    console.error("Error loading profile page:", error);
    req.flash('error', 'An error occurred while loading your profile.');
    res.redirect('/student/dashboard');
  }
});

// POST route to update the profile information
router.post('/profile', isLoggedIn, upload.single('image'), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);

    if (!student) {
      req.flash('error', 'Could not find your profile to update.');
      return res.redirect('/student/login');
    }

    // Update standard text fields
    student.fullname = req.body.fullname || student.fullname;
    student.contact = req.body.contact || student.contact;
    student.branch = req.body.branch || student.branch; // Update branch

    // Process and update interests from the hidden input
    if (req.body.interests) {
      student.interests = req.body.interests
        .split(',') // Split the comma-separated string into an array
        .map(interest => interest.trim()) // Trim whitespace from each item
        .filter(interest => interest); // Remove any empty items
    } else {
      student.interests = []; // Clear interests if the field is empty
    }

    // Handle profile image upload
    if (req.file) {
      student.image = req.file.buffer;
    }

    await student.save();

    req.flash('success', 'Profile updated successfully!');
    res.redirect('/student/profile');
  } catch (err) {
    console.error("Error updating profile:", err);
    req.flash('error', 'An error occurred while updating your profile.');
    res.redirect('/student/profile');
  }
});

module.exports = router;
