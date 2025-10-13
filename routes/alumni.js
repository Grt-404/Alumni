const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const isLoggedIn = require("../middlewares/isLoggedin");
const isVerified = require("../middlewares/isVerified");
const Alumni = require("../models/alumni-model");
const Event = require("../models/event-model");
const Student = require("../models/student-model");
const Job = require("../models/job-model");
const multer = require("multer");
const nodemailer = require("nodemailer");
const EventRequest = require("../models/eventRequest-model");
const Message = require('../models/message-model');
const upload = multer();
const Post = require("../models/post-model");
const collegeModel = require('../models/college-model');

const EVENT_CREATION_POINTS = 200;
const PROFILE_UPDATE_POINTS = 100;
const JOB_POSTING_POINTS = 150;
const POINTS_PER_DOLLAR = 100;

// --- CHAT ROUTES ---

router.get('/chat', isLoggedIn, isVerified, async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.user._id).populate('connections');

    if (alumni.connections && alumni.connections.length > 0) {
      const firstConnectionId = alumni.connections[0]._id;
      return res.redirect(`/alumni/chat/${firstConnectionId}`);
    } else {
      res.render('alumni-chat', {
        user: req.user,
        connections: [],
        activeChat: null,
        messages: []
      });
    }
  } catch (error) {
    console.error("Error loading main alumni chat page:", error);
    req.flash('error', 'Something went wrong.');
    res.redirect('/alumni/dashboard');
  }
});

router.get('/chat/:studentId', isLoggedIn, isVerified, async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.user._id).populate('connections');
    const student = await Student.findById(req.params.studentId);

    if (!student || !alumni.connections.some(conn => conn._id.equals(student._id)) || student.college.toString() !== req.user.college.toString()) {
      req.flash('error', 'You can only chat with your connections from the same college.');
      return res.redirect('/alumni/dashboard');
    }

    const messages = await Message.find({
      $or: [
        { from: alumni._id, to: student._id },
        { from: student._id, to: alumni._id }
      ]
    }).sort({ createdAt: 'asc' });

    res.render('alumni-chat', {
      user: req.user,
      connections: alumni.connections,
      activeChat: student,
      messages: messages
    });
  } catch (error) {
    console.error("Error loading alumni chat page:", error);
    req.flash('error', 'Something went wrong.');
    res.redirect('/alumni/dashboard');
  }
});

router.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.user._id).populate('invitations');
    const user = req.user;

    const posts = await Post.find()
      .populate({
        path: 'author',
        match: { college: req.user.college },
        select: 'name currentCompany designation image'
      })
      .sort({ createdAt: -1 });

    const requests = await EventRequest.find({ status: "pending", upvotes: { $gt: 4 } })
      .populate({
        path: 'requestedBy',
        match: { college: req.user.college },
        select: 'fullname'
      })
      .sort({ createdAt: -1 })
      .limit(3);

    res.render("alumni-dashboard", { user, posts: posts.filter(p => p.author), requests: requests.filter(r => r.requestedBy), invitations: alumni.invitations });
  } catch (err) {
    console.error(err);
    req.flash?.("error", "Unable to load dashboard");
    res.redirect("/");
  }
});

// --- CONNECTION/INVITATION ROUTES ---

router.post('/connections/respond/:studentId', isLoggedIn, isVerified, async (req, res) => {
  try {
    const { action } = req.body;
    const alumniId = req.user._id;
    const studentId = req.params.studentId;

    const alumni = await Alumni.findById(alumniId);
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    alumni.invitations.pull(studentId);
    student.sentRequests.pull(alumniId);

    if (action === 'accept') {
      alumni.connections.push(studentId);
      student.connections.push(alumniId);
    }

    await alumni.save();
    await student.save();

    res.status(200).json({ message: `Request ${action}ed successfully.` });
  } catch (error) {
    console.error("Error responding to request:", error);
    res.status(500).json({ error: "Server error." });
  }
});

// --- AUTH ROUTES ---

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS,
  },
});

router.get("/register", async (req, res) => {
  try {
    const colleges = await collegeModel.find({});
    res.render("register-alumni", { colleges });
  } catch (error) {
    console.error("Error fetching colleges for registration:", error);
    res.redirect('/register');
  }
});

router.get("/leaderboard", isLoggedIn, isVerified, async (req, res) => {
  try {
    const alumniData = await Alumni.find({ status: 'Verified', college: req.user.college })
      .select("name points")
      .sort({ points: -1 })
      .lean();

    const users = alumniData.map((alumnus, index) => ({
      id: alumnus._id.toString(),
      rank: index + 1,
      name: alumnus.name,
      points: alumnus.points
    }));

    res.render("leaderboard", {
      users: users,
      currentUserId: req.user._id.toString()
    });
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    req.flash('error', 'Could not load leaderboard data.');
    res.redirect('/alumni/dashboard');
  }
});

router.post("/register", (req, res) => {
  req.body.role = "alumni";
  authController.registerUser(req, res);
});

router.get("/login", (req, res) => {
  res.render("login-alumni");
});

router.post("/login", (req, res) => {
  req.body.role = "alumni";
  authController.loginUser(req, res);
});

// --- DONATE & PROFILE ROUTES ---

router.get("/donate", isLoggedIn, isVerified, (req, res) => {
  res.render("donate");
});

router.get("/profile", isLoggedIn, isVerified, async (req, res) => {
  res.render("complete-profile", { alumni: req.user });
});

router.post(
  "/profile",
  isLoggedIn, isVerified,
  upload.single("image"),
  async (req, res) => {
    try {
      const alumni = await Alumni.findById(req.user._id);

      alumni.name = req.body.name || alumni.name;
      alumni.graduationYear = req.body.graduationYear || alumni.graduationYear;
      alumni.branch = req.body.branch || alumni.branch;
      alumni.currentCompany = req.body.currentCompany || alumni.currentCompany;
      alumni.designation = req.body.designation || alumni.designation;
      alumni.location = req.body.location || alumni.location;
      alumni.bio = req.body.bio || alumni.bio;
      alumni.linkedin = req.body.linkedin || alumni.linkedin;

      if (req.file) {
        alumni.image = req.file.buffer;
      }

      await alumni.save();

      await Alumni.findByIdAndUpdate(
        req.user._id,
        { $inc: { points: PROFILE_UPDATE_POINTS } }
      );

      req.flash("success", `Profile updated successfully and ${PROFILE_UPDATE_POINTS} points awarded!`);
      res.redirect("/alumni/dashboard");
    } catch (err) {
      console.error(err);
      req.flash("error", "Something went wrong while updating profile");
      res.redirect("/alumni/dashboard");
    }
  }
);

// --- EVENT ROUTES (EMAIL HELPER FUNCTION) ---

async function sendEmails(title, description, link, collegeId) {
  try {
    const studentList = await Student.find({ college: collegeId }, "email fullname");
    const BATCH_SIZE = 10;

    for (let i = 0; i < studentList.length; i += BATCH_SIZE) {
      const batch = studentList.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map((student) =>
          transporter.sendMail({
            from: '"Team Sampark" <samparkapp25@gmail.com>',
            to: student.email,
            subject: `Meeting Scheduled: ${title}`,
            text: `Hello ${student.fullname},\n\nA meeting has been scheduled.\n\nTitle: ${title}\nDescription: ${description}\n\nJoin here: ${link}\n\nRegards,\nTeam Sampark`,
            html: `
                        <div style="background-color: #f8f5f2; margin: 0; padding: 20px; font-family: Inter, Arial, sans-serif; color: #1f1c18;">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center">
                                <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
                                  <tr>
                                    <td align="center" style="padding: 20px 0; font-family: 'Playfair Display', serif; font-size: 36px; color: #a16207; font-weight: bold;">
                                      SAMPARK
                                    </td>
                                  </tr>
                                  <tr>
                                    <td bgcolor="#ffffff" style="padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                                      <h2 style="font-family: 'Playfair Display', serif; font-size: 28px; margin-top: 0; margin-bottom: 20px; color: #1f1c18;">
                                        Meeting Invitation
                                      </h2>
                                      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6;">
                                        Hello <b>${student.fullname}</b>,
                                      </p>
                                      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6;">
                                        A meeting has been scheduled with the following details:
                                      </p>
                                      <div style="background-color: #f8f5f2; border-left: 4px solid #a16207; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                                        <p style="margin: 0 0 10px; font-size: 16px; color: #57534e;"><strong>Title:</strong></p>
                                        <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600;">${title}</p>
                                        <p style="margin: 0 0 10px; font-size: 16px; color: #57534e;"><strong>Description:</strong></p>
                                        <p style="margin: 0; font-size: 16px; line-height: 1.6;">${description}</p>
                                      </div>
                                      <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                        <tr>
                                          <td align="center">
                                            <a href="${link}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #a16207; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                              Join Google Meet
                                            </a>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td align="center" style="padding: 30px 20px; font-size: 14px; color: #78716c;">
                                      <p style="margin: 0;">Regards,</p>
                                      <p style="margin: 5px 0 0;"><b>Team Sampark</b></p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </div>
                        `,
          })
        )
      );

      console.log(`Batch ${i / BATCH_SIZE + 1} sent`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error("Error sending meeting emails:", err);
    throw err;
  }
}

router.get("/event", isLoggedIn, isVerified, (req, res) => {
  res.render("event");
});

router.post("/event", isLoggedIn, isVerified, async (req, res) => {
  try {
    const { title, description, date, gmeetLink } = req.body;

    const event = new Event({
      title,
      description,
      date,
      gmeetLink,
      createdBy: req.user._id,
      college: req.user.college
    });
    await event.save();

    await Alumni.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: EVENT_CREATION_POINTS } }
    );

    req.flash("success", `Event created and ${EVENT_CREATION_POINTS} points awarded!`);
    res.redirect("/alumni/dashboard");

    await sendEmails(title, description, gmeetLink, req.user.college);
  } catch (error) {
    console.error(error);
    req.flash("error", "Error creating event.");
    res.status(400).redirect("/alumni/dashboard");
  }
});

router.get("/eventrequests", isLoggedIn, isVerified, async (req, res) => {
  try {
    const requests = await EventRequest.find({
      status: "pending",
      upvotes: { $gt: 4 },
      college: req.user.college
    }).populate("requestedBy", "fullname email");

    res.render("eventRequestsAlum", { requests });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

router.post("/eventrequests/accept/:id", async (req, res) => {
  try {
    const request = await EventRequest.findById(req.params.id);
    if (!request) return res.status(404).send("Request not found");

    res.render("create-event-from-request", { request });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

router.post("/eventrequests/create-event/:id", isLoggedIn, isVerified, async (req, res) => {
  try {
    const request = await EventRequest.findById(req.params.id);
    if (!request) return res.status(404).send("Request not found");

    const { date, gmeetLink } = req.body;
    const event = new Event({
      title: request.title,
      description: request.description,
      date,
      gmeetLink,
      college: req.user.college
    });

    await event.save();

    request.status = "approved";
    await request.save();

    res.redirect("/alumni/eventrequests");
    await sendEmails(event.title, event.description, event.gmeetLink, req.user.college);
    await Alumni.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: EVENT_CREATION_POINTS } }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// --- NETWORK ROUTES ---

router.get('/network', isLoggedIn, isVerified, async (req, res) => {
  try {
    const { search, branch, graduationYear, location } = req.query;

    const filterQuery = { status: 'Verified', college: req.user.college };

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filterQuery.$or = [
        { name: searchRegex },
        { currentCompany: searchRegex },
        { designation: searchRegex }
      ];
    }
    if (branch) {
      filterQuery.branch = branch;
    }
    if (graduationYear) {
      filterQuery.graduationYear = parseInt(graduationYear);
    }
    if (location) {
      filterQuery.location = new RegExp(location, 'i');
    }

    const alumniList = await Alumni.find(filterQuery);

    res.render('network', {
      user: req.user,
      alumniList: alumniList,
      query: req.query
    });
  } catch (error) {
    console.error("Error fetching alumni network:", error);
    res.status(500).send("Server Error");
  }
});

// --- JOB ROUTES ---

router.get('/jobs', isLoggedIn, isVerified, async (req, res) => {
  try {
    const jobs = await Job.find({ college: req.user.college }).sort({ createdAt: -1 }).populate('postedBy', 'name currentCompany designation');

    res.render('jobs', {
      user: req.user,
      jobList: jobs,
      query: req.query
    });
  } catch (error) {
    console.error("Error fetching jobs page:", error);
    res.status(500).send("Server Error");
  }
});

router.get('/jobs/new', isLoggedIn, isVerified, (req, res) => {
  res.render("post-new-job");
});

router.post('/jobs/new', isLoggedIn, isVerified, async (req, res) => {
  try {
    const { title, company, description, location, type } = req.body;

    const job = new Job({
      title,
      company,
      description,
      location,
      type,
      postedBy: req.user._id,
      college: req.user.college
    });
    await job.save();

    await Alumni.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: JOB_POSTING_POINTS } }
    );

    req.flash('success', `Job posted successfully and ${JOB_POSTING_POINTS} points awarded!`);
    res.redirect('/alumni/jobs');
  } catch (error) {
    console.error("Error creating new job posting:", error);
    req.flash('error', 'Error posting job. Please check all fields.');
    res.redirect('/alumni/jobs/new');
  }
});

module.exports = router;

