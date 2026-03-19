const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const Referral = require('../models/referral-model');
const isLoggedIn = require("../middlewares/isLoggedin");
const Post = require("../models/post-model");
const Message = require('../models/message-model');
const EventRequest = require("../models/eventRequest-model");
const Student = require("../models/student-model");
const Alumni = require("../models/alumni-model");
const Event = require("../models/event-model");
const collegeModel = require('../models/college-model');
const multer = require("multer");
const upload = multer();
const axios = require('axios');

router.get("/mentor-suggestions", isLoggedIn, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);
    const alumniList = await Alumni.find({ college: student.college, status: 'Verified' });

    if (alumniList.length === 0) {
      return res.render("suggestions", { recommendations: [] });
    }

    const payload = {
      student: {
        id: student._id.toString(),
        Age: student.age,
        Gender: student.gender,
        Role: "Student",
        Seniority_Level: "Entry",
        Industry: student.industry,
        Location_City: student.location,
        Business_Interests: student.interests.join(" "),
        Business_Objectives: student.objectives,
        Constraints: student.constraints,
        Company_Size_Employees: 0
      },
      alumni: alumniList.map(alum => ({
        id: alum._id.toString(),
        Age: alum.age,
        Gender: alum.gender,
        Role: alum.designation || "Professional",
        Seniority_Level: alum.seniority,
        Industry: alum.industry,
        Location_City: alum.location,
        Business_Interests: alum.bio,
        Business_Objectives: alum.objectives,
        Constraints: alum.constraints,
        Company_Size_Employees: alum.companySize
      }))
    };

    const response = await axios.post('http://127.0.0.1:8000/recommend', payload);

    const recommendations = alumniList.map(alum => {
      const match = response.data.recommendations.find(r => r.alumni_id === alum._id.toString());
      return {
        ...alum._doc,
        compatibilityScore: match ? match.compatibilityScore : 0
      };
    }).sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    res.render("suggestions", { recommendations });

  } catch (err) {
    console.error("AI Error:", err.message);
    res.redirect('/student/dashboard');
  }
});

router.post('/connect/:alumniId', isLoggedIn, async (req, res) => {
  try {
    const studentId = req.user._id;
    const alumniId = req.params.alumniId;

    const student = await Student.findById(studentId);
    const alumni = await Alumni.findById(alumniId);

    if (!student) {
      return res.status(404).json({ error: "Logged-in student not found." });
    }
    if (!alumni) {
      return res.status(404).json({ error: "Alumni not found." });
    }

    if (student.college.toString() !== alumni.college.toString()) {
      return res.status(403).json({ error: "You can only connect with alumni from your own college." });
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
router.post('/referral', isLoggedIn, upload.single('resume'), async (req, res) => {
  try {
    const { alumnus, company, jobLink, message } = req.body;

    if (!req.file) {
      req.flash('error', 'Please attach your resume (PDF or Docx).');
      return res.redirect('/student/referrals');
    }

    const referral = new Referral({
      student: req.user._id,
      alumnus: alumnus,
      company: company,
      jobLink: jobLink,
      message: message,
      resume: req.file.buffer,
      resumeMimeType: req.file.mimetype,
      resumeName: req.file.originalname,
      college: req.user.college
    });

    await referral.save();

    req.flash('success', 'Referral request sent successfully!');
    res.redirect('/student/dashboard');
  } catch (error) {
    console.error("Error sending referral:", error);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/student/referrals');
  }
});
router.get("/register", async (req, res) => {
  try {
    const colleges = await collegeModel.find({});
    res.render("register-student", { colleges });
  } catch (error) {
    console.error("Error fetching colleges for registration:", error);
    res.redirect('/register');
  }
});

router.get('/chat/:recipientId', isLoggedIn, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id).populate('connections');
    const recipient = await Alumni.findById(req.params.recipientId);

    if (!recipient || !student.connections.some(conn => conn._id.equals(recipient._id)) || recipient.college.toString() !== req.user.college.toString()) {
      console.log("Chat access denied: User is not a connection or from the same college.");
      return res.redirect('/student/connections');
    }

    const messages = await Message.find({
      $or: [
        { from: student._id, to: recipient._id },
        { from: recipient._id, to: student._id }
      ]
    }).sort({ createdAt: 'asc' });

    res.render('chat', {
      user: req.user,
      connections: student.connections,
      activeChat: recipient,
      messages: messages
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

router.get('/connections', isLoggedIn, async (req, res) => {
  try {
    const student = await Student.findById(req.user._id)
      .populate('connections');

    if (!student) {
      console.error(`Connections page error: Student not found with ID: ${req.user._id}`);
      req.flash('error', 'Your session has expired. Please log in again.');
      return res.redirect('/login');
    }

    res.render('connections', {
      user: req.user,
      connections: student.connections
    });
  } catch (error) {
    console.error("Error fetching connections:", error);
    req.flash('error', 'An error occurred while loading your connections.');
    res.redirect('/student/dashboard');
  }
});

router.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const posts = await Post.find().populate({
      path: 'author',
      match: { college: req.user.college }
    });
    const AlumniList = await Alumni.find({ status: "Verified", college: req.user.college }).sort({ createdAt: -1 });
    const today = new Date();
    const events = await Event.find({ date: { $gte: today } }).populate({
      path: 'createdBy',
      match: { college: req.user.college }
    }).sort({ date: 1 }).limit(3);

    let recommendations = [];
    if (req.user.interests && req.user.interests.length > 0) {
      try {
        const payload = {
          student: {
            id: req.user._id.toString(),
            Age: req.user.age,
            Gender: req.user.gender,
            Role: "Student",
            Seniority_Level: "Entry",
            Industry: req.user.industry,
            Location_City: req.user.location,
            Business_Interests: req.user.interests.join(" "),
            Business_Objectives: req.user.objectives,
            Constraints: req.user.constraints,
            Company_Size_Employees: 0
          },
          alumni: AlumniList.map(alum => ({
            id: alum._id.toString(),
            Age: alum.age,
            Gender: alum.gender,
            Role: alum.designation || "Professional",
            Seniority_Level: alum.seniority,
            Industry: alum.industry,
            Location_City: alum.location,
            Business_Interests: alum.bio,
            Business_Objectives: alum.objectives,
            Constraints: alum.constraints,
            Company_Size_Employees: alum.companySize
          }))
        };

        const response = await axios.post('http://127.0.0.1:8000/recommend', payload);

        recommendations = AlumniList.map(alum => {
          const match = response.data.recommendations.find(r => r.alumni_id === alum._id.toString());
          return {
            ...alum._doc,
            compatibilityScore: match ? match.compatibilityScore : 0
          };
        }).sort((a, b) => b.compatibilityScore - a.compatibilityScore).slice(0, 3);
      } catch (aiErr) {
        console.warn("⚠️ AI recommendations unavailable, using fallback alumni:", aiErr.message);
        recommendations = AlumniList.slice(0, 3);
      }
    }

    res.render("student-dashboard", {
      user: req.user,
      posts: posts.filter(p => p.author),
      AlumniList,
      events: events.filter(e => e.createdBy),
      recommendations
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

router.get("/eventrequest", isLoggedIn, (req, res) => {
  res.render("eventrequest");
});

router.post("/eventrequest", isLoggedIn, async (req, res) => {
  try {
    const { title, description } = req.body;
    const requestedBy = req.user._id;

    const eventRequest = new EventRequest({ title, description, requestedBy, college: req.user.college });
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

    if (event.requestedBy.toString() === userId)
      return res.redirect("/student/events");

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
    const events = await EventRequest.find({ college: req.user.college }).populate(
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
    const posts = await Post.find().populate({
      path: 'author',
      match: { college: req.user.college }
    });
    res.render("studenAlumPost", {
      user: req.user,
      posts: posts.filter(p => p.author),
    });
  } catch (err) {
    console.error("❌ Error loading posts:", err);
    res.status(500).send("Server Error");
  }
});

router.get("/referrals", isLoggedIn, async (req, res) => {
  const student = await Student.findById(req.user._id)
    .populate({
      path: 'connections',
      match: { college: req.user.college }
    });

  res.render("studentRef", {
    user: req.user,
    connections: student.connections
  })
})

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.get("/map", isLoggedIn, async (req, res) => {
  try {
    const alumniData = await Alumni.find({
      _id: { $ne: req.user._id },
      college: req.user.college
    });

    res.render("map", {
      user: req.user,
      alumniList: alumniData,
    });
  } catch (err) {
    console.error("Error loading alumni map page:", err)
    res.redirect('/student/dashboard');
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

router.post('/profile', isLoggedIn, upload.single('image'), async (req, res) => {
  try {
    const student = await Student.findById(req.user._id);

    student.fullname = req.body.fullname || student.fullname;
    student.contact = req.body.contact || student.contact;
    student.age = req.body.age || student.age;
    student.gender = req.body.gender || student.gender;

    student.industry = req.body.industry || student.industry;
    student.location = req.body.location || student.location;
    student.objectives = req.body.objectives || student.objectives;
    student.constraints = req.body.constraints || student.constraints;

    if (req.body.interests) {
      student.interests = req.body.interests.split(',').map(i => i.trim());
    }

    if (req.file) student.image = req.file.buffer;

    student.isProfileComplete = true;
    await student.save();

    req.flash('success', 'Profile updated! AI Recommendations are now active.');
    res.redirect('/student/profile');
  } catch (err) {
    console.error(err);
    res.redirect('/student/profile');
  }
});
module.exports = router;

