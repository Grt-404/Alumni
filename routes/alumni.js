const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const isLoggedIn = require("../middlewares/isLoggedin");
const isVerified = require("../middlewares/isVerified");
const Alumni = require("../models/alumni-model");
const Event = require("../models/event-model");
const Student = require("../models/student-model");
const Job = require("../models/job-model"); // <-- IMPORTED NEW JOB MODEL
const multer = require("multer");
const nodemailer = require("nodemailer");
const EventRequest = require("../models/eventRequest-model");
const Message = require('../models/message-model');
const upload = multer();
const Post = require("../models/post-model");

const EVENT_CREATION_POINTS = 200;
const PROFILE_UPDATE_POINTS = 100;
const JOB_POSTING_POINTS = 150; // Points awarded for posting a new job
// Define the rate: 100 points per 1 unit of currency (assuming currency is dollars)
const POINTS_PER_DOLLAR = 100;

// --- CHAT ROUTES ---

router.get('/chat', isLoggedIn, isVerified, async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.user._id).populate('connections');

    // If the alumni has connections, redirect to a chat with the first one.
    if (alumni.connections && alumni.connections.length > 0) {
      const firstConnectionId = alumni.connections[0]._id;
      return res.redirect(`/alumni/chat/${firstConnectionId}`);
    } else {
      // If no connections, render the chat page with an empty state.
      res.render('alumni-chat', {
        user: req.user,
        connections: [],
        activeChat: null, // No active chat
        messages: []
      });
    }
  } catch (error) {
    console.error("Error loading main alumni chat page:", error);
    req.flash('error', 'Something went wrong.');
    res.redirect('/alumni/dashboard');
  }
});


// --- ROUTE TO RENDER A SPECIFIC CHAT WITH A STUDENT ---
router.get('/chat/:studentId', isLoggedIn, isVerified, async (req, res) => {
  try {
    const alumni = await Alumni.findById(req.user._id).populate('connections');
    const student = await Student.findById(req.params.studentId);

    // Security Check: Ensure the student is actually a connection
    if (!student || !alumni.connections.some(conn => conn._id.equals(student._id))) {
      // If there are no connections at all, handle that case gracefully
      if (alumni.connections.length === 0) {
        return res.render('alumni-chat', {
          user: req.user,
          connections: [],
          activeChat: null,
          messages: []
        });
      }
      req.flash('error', 'You can only chat with your connections.');
      return res.redirect('/alumni/dashboard');
    }

    // Fetch the chat history between the alumnus and this student
    const messages = await Message.find({
      $or: [
        { from: alumni._id, to: student._id },
        { from: student._id, to: alumni._id }
      ]
    }).sort({ createdAt: 'asc' });

    // Render the chat view
    res.render('alumni-chat', {
      user: req.user,
      connections: alumni.connections, // This is a list of students
      activeChat: student,              // The student the alumni is currently chatting with
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
    const alumni = await Alumni.findById(req.user._id)
      .populate('invitations');
    const user = req.user; // coming from isLoggedIn middleware
    // fetch posts (all alumni posts)
    const posts = await Post.find()
      .populate("author", "name currentCompany designation image")
      .sort({ createdAt: -1 });

    const requests = await EventRequest.find({ status: "pending", upvotes: { $gt: 4 } })
      .populate("requestedBy", "fullname") // populate student's name
      .sort({ createdAt: -1 })
      .limit(3);

    res.render("alumni-dashboard", { user, posts, requests, invitations: alumni.invitations });
  } catch (err) {
    console.error(err);
    req.flash?.("error", "Unable to load dashboard");
    res.redirect("/");
  }
});

// --- CONNECTION/INVITATION ROUTES ---

router.post('/connections/respond/:studentId', isLoggedIn, isVerified, async (req, res) => {
  try {
    const { action } = req.body; // This will be 'accept' or 'reject'
    const alumniId = req.user._id;
    const studentId = req.params.studentId;

    const alumni = await Alumni.findById(alumniId);
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ error: "Student not found." });
    }

    // --- ALWAYS REMOVE THE PENDING REQUEST ---
    // Pull the student's ID from the alumni's invitations list
    alumni.invitations.pull(studentId);
    // Pull the alumni's ID from the student's sent requests list
    student.sentRequests.pull(alumniId);

    // --- IF ACCEPTED, ADD TO CONNECTIONS ---
    if (action === 'accept') {
      // Add to both users' connections lists
      alumni.connections.push(studentId);
      student.connections.push(alumniId);
    }

    await alumni.save();
    await student.save();

    res.status(200).json({ message: `Request ${action}ed successfully.` });

  } catch (error) {
    res.redirect("/alumni/dashboard");
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

router.get("/register", (req, res) => {
  res.render("register-alumni");
});

// --- LEADERBOARD ROUTE (NOW DYNAMIC) ---
router.get("/leaderboard", isLoggedIn, isVerified, async (req, res) => {
  try {
    // 1. Fetch only VERIFIED alumni, sorting by points descending
    const alumniData = await Alumni.find({ status: 'Verified' }) // <-- CORE FIX
      .select("name points")
      .sort({ points: -1 })
      .lean(); // Use .lean() for faster read operations

    // 2. Map data to include rank
    const users = alumniData.map((alumnus, index) => ({
      id: alumnus._id.toString(), // Convert ObjectId to string for easy comparison
      rank: index + 1,
      name: alumnus.name,
      points: alumnus.points
    }));

    // 3. Render the leaderboard view with dynamic data
    res.render("leaderboard", {
      users: users,
      // Pass the current user's ID to highlight their row
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
  res.render("donate");// points will be added after donation portal is complete.
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
      // 1. Find the current Alumni document
      const alumni = await Alumni.findById(req.user._id);

      // --- Update Profile Fields ---
      alumni.name = req.body.name || alumni.name;
      alumni.graduationYear = req.body.graduationYear || alumni.graduationYear;
      alumni.branch = req.body.branch || alumni.branch;
      alumni.currentCompany = req.body.currentCompany || alumni.currentCompany;
      alumni.designation = req.body.designation || alumni.designation;
      alumni.location = req.body.location || alumni.location;
      alumni.bio = req.body.bio || alumni.bio;
      alumni.linkedin = req.body.linkedin || alumni.linkedin;

      if (req.file) {
        // Assuming your 'image' field stores the buffer
        alumni.image = req.file.buffer;
      }

      // 2. Save the updated profile data
      await alumni.save();

      // 3. 🎁 Award Points using $inc (Mongoose update)
      await Alumni.findByIdAndUpdate(
        req.user._id,
        { $inc: { points: PROFILE_UPDATE_POINTS } }
      );

      // 4. Respond to the client
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

/**
 * Sends beautifully formatted emails to all students about a scheduled meeting.
 *
 * @param {string} title The title of the meeting.
 * @param {string} description The description for the meeting.
 * @param {string} link The Google Meet link for the meeting.
 */
async function sendEmails(title, description, link) {
  try {
    const studentList = await Student.find({}, "email fullname");
    const BATCH_SIZE = 10; // Send 10 emails at a time

    for (let i = 0; i < studentList.length; i += BATCH_SIZE) {
      const batch = studentList.slice(i, i + BATCH_SIZE);

      // Send this batch in parallel
      await Promise.all(
        batch.map((student) =>
          transporter.sendMail({
            from: '"Team Sampark" <samparkapp25@gmail.com>',
            to: student.email,
            subject: `Meeting Scheduled: ${title}`,
            // Plain text fallback for email clients that don't support HTML
            text: `Hello ${student.fullname},\n\nA meeting has been scheduled.\n\nTitle: ${title}\nDescription: ${description}\n\nJoin here: ${link}\n\nRegards,\nTeam Sampark`,
            // New, beautifully styled HTML email
            html: `
            <div style="background-color: #f8f5f2; margin: 0; padding: 20px; font-family: Inter, Arial, sans-serif; color: #1f1c18;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
                      <!-- Header -->
                      <tr>
                        <td align="center" style="padding: 20px 0; font-family: 'Playfair Display', serif; font-size: 36px; color: #a16207; font-weight: bold;">
                          SAMPARK
                        </td>
                      </tr>
                      <!-- Main Content Card -->
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
                          <!-- Details Box -->
                          <div style="background-color: #f8f5f2; border-left: 4px solid #a16207; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                            <p style="margin: 0 0 10px; font-size: 16px; color: #57534e;"><strong>Title:</strong></p>
                            <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600;">${title}</p>
                            <p style="margin: 0 0 10px; font-size: 16px; color: #57534e;"><strong>Description:</strong></p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6;">${description}</p>
                          </div>
                          <!-- CTA Button -->
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
                      <!-- Footer -->
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
      await new Promise((r) => setTimeout(r, 1000)); // wait 1 second between batches
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

    // 1. Create the Event
    const event = new Event({
      title,
      description,
      date,
      gmeetLink,
      // Assuming you want to link the event to the creator
      createdBy: req.user._id
    });
    await event.save();

    // 2. Award Points to the Alumnus
    await Alumni.findByIdAndUpdate(
      req.user._id, // ✅ req.user is now available
      { $inc: { points: EVENT_CREATION_POINTS } }
    );

    // 3. Respond and then asynchronously send emails
    req.flash("success", `Event created and ${EVENT_CREATION_POINTS} points awarded!`);
    res.redirect("/alumni/dashboard");

    // 4. Send emails in the background
    await sendEmails(title, description, gmeetLink);

  } catch (error) {
    console.error(error);
    req.flash("error", "Error creating event.");
    res.status(400).redirect("/alumni/dashboard");
  }
});

router.get("/eventrequests", isLoggedIn, isVerified, async (req, res) => {
  try {
    // Fetch requests with more than 10 upvotes and status pending
    const requests = await EventRequest.find({
      upvotes: { $gt: 4 },
      status: "pending",
    }).populate("requestedBy", "fullname email"); // populate who requested

    res.render("eventRequestsAlum", { requests });
  } catch (err) {
    res.redirect("/alumni/dashboard");
    console.error(err);
    res.status(500).send("Server Error");
  }
});

router.post("/eventrequests/accept/:id", async (req, res) => {
  try {
    const request = await EventRequest.findById(req.params.id);
    if (!request) return res.status(404).send("Request not found");

    // Render form with title & description prefilled
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
    });

    await event.save();

    // mark request as approved
    request.status = "approved";
    await request.save();

    // Send emails as before
    res.redirect("/alumni/eventrequests");
    await sendEmails(event.title, event.description, event.gmeetLink);
    await Alumni.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: EMAIL_POINTS } }
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

    // Base query to only fetch verified alumni
    const filterQuery = { status: 'Verified' };

    // Add filters to the query if they exist
    if (search) {
      const searchRegex = new RegExp(search, 'i'); // Case-insensitive regex
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
      user: req.user, // The logged-in alumni
      alumniList: alumniList, // The filtered list of alumni to display
      query: req.query // Pass the query parameters to pre-fill the form
    });

  } catch (error) {
    res.redirect("/alumni/dashboard");
    console.error("Error fetching alumni network:", error);
    res.status(500).send("Server Error");
  }
});

// --- JOB ROUTES (NOW DYNAMIC!) ---

router.get('/jobs', isLoggedIn, isVerified, async (req, res) => {
  try {
    // 1. Fetch all job postings from the database
    const jobs = await Job.find().sort({ createdAt: -1 }).populate('postedBy', 'name currentCompany designation');

    res.render('jobs', {
      user: req.user,
      jobList: jobs, // Pass live data to the template
      query: req.query
    });
  } catch (error) {
    res.redirect("/alumni/dashboard");
    console.error("Error fetching jobs page:", error);
    res.status(500).send("Server Error");
  }
});

// Placeholder for the "Post New Job" page (GET request to show the form)
router.get('/jobs/new', isLoggedIn, isVerified, (req, res) => {
  res.render("post-new-job"); // Assume you have a view file named 'post-new-job.ejs'
});

// Route to handle new job posting (POST request to submit the form)
router.post('/jobs/new', isLoggedIn, isVerified, async (req, res) => {
  try {
    const { title, company, description, location, type } = req.body;

    // 1. Create the new job document
    const job = new Job({
      title,
      company,
      description,
      location,
      type,
      postedBy: req.user._id // Link job to the posting alumnus
    });
    await job.save();

    // 2. Award points to the alumnus for contribution
    await Alumni.findByIdAndUpdate(
      req.user._id,
      { $inc: { points: JOB_POSTING_POINTS } }
    );

    // 3. Success response
    req.flash('success', `Job posted successfully and ${JOB_POSTING_POINTS} points awarded!`);
    res.redirect('/alumni/jobs');

  } catch (error) {
    console.error("Error creating new job posting:", error);
    req.flash('error', 'Error posting job. Please check all fields.');
    res.redirect('/alumni/jobs/new');
  }
});


module.exports = router;

