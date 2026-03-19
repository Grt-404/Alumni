const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const isLoggedIn = require("../middlewares/isLoggedin");
const Alumni = require('../models/alumni-model');
const Student = require("../models/student-model");
const Job = require("../models/job-model");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const alumniModel = require("../models/alumni-model")
const studentModel = require("../models/student-model")


const fs = require("fs");
const csv = require("csv-parser");
const XLSX = require("xlsx");
const stream = require("stream");

const { Parser } = require('json2csv');



const storage = multer.memoryStorage();

const upload = multer({ storage });


router.get("/register", (req, res) => {
    res.render("register-college");
});

router.post("/register", (req, res) => {
    req.body.role = "college";
    authController.registerUser(req, res);
});

router.get("/login", (req, res) => {
    res.render("login-college");
});
router.get("/dashboard", isLoggedIn, async (req, res) => {
    const students = await studentModel.find({ college: req.user._id });
    const alumnis = await alumniModel.find({ college: req.user._id });
    res.render("college/dashboard", { students, alumnis });
})

router.post("/login", (req, res) => {
    req.body.role = "college";
    authController.loginUser(req, res);
});



router.get('/alumni', isLoggedIn, async (req, res) => {
    try {
        const { search, department, year } = req.query;

        const filterQuery = { role: 'alumni', college: req.user._id };

        if (search && search.trim() !== '') {
            filterQuery.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { email: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (department && department.trim() !== '') {
            filterQuery.branch = department;
        }

        if (year && !isNaN(parseInt(year))) {
            filterQuery.graduationYear = parseInt(year);
        }

        const filteredAlumni = await Alumni.find(filterQuery).sort({ graduationYear: -1 });


        res.render('college/Alumni', {
            alumni: filteredAlumni,
            query: req.query
        });

    } catch (error) {
        console.error("Error fetching alumni:", error);
        res.status(500).send("Server Error");
    }
});


router.get("/upload/csv", isLoggedIn, (req, res) => {
    res.render("college/uploadcsv");
});
router.get("/upload/sheet", isLoggedIn, (req, res) => {
    res.render("college/uploadsheet");
});




router.post("/upload/csv", isLoggedIn, upload.single("alumni-csv"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        const results = [];

        const readable = new stream.Readable();
        readable._read = () => { };
        readable.push(req.file.buffer);
        readable.push(null);

        readable
            .pipe(csv())
            .on("data", (data) => results.push(data))
            .on("end", async () => {
                try {
                    for (let row of results) {
                        const alumniDoc = {
                            role: "alumni",
                            name: row.name?.trim(),
                            email: row.email?.toLowerCase(),
                            password: await bcrypt.hash(row.password || "default123", 10),
                            branch: row.branch || "",
                            graduationYear: parseInt(row.graduationYear) || null,
                            currentCompany: row.currentCompany || "",
                            designation: row.designation || "",
                            location: row.location || "",
                            linkedin: row.linkedin || "",
                            status: "Verified",
                            isProfileComplete: true,
                            college: req.user._id
                        };

                        await Alumni.updateOne(
                            { email: alumniDoc.email, college: req.user._id },
                            { $set: alumniDoc },
                            { upsert: true }
                        );
                    }

                    res.redirect("/college/alumni");
                } catch (err) {
                    console.error("Error saving alumni:", err);
                    res.status(500).send("Error processing CSV file");
                }
            })
            .on("error", (err) => {
                console.error("CSV parse error:", err);
                res.status(500).send("Error parsing CSV file");
            });

    } catch (error) {
        console.error("Error uploading CSV:", error);
        res.status(500).send("Server Error");
    }
});


router.post("/upload/sheet", isLoggedIn, upload.single("alumni-sheet"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet);

        for (let row of rows) {
            if (!row.name || !row.email) continue;

            const alumniDoc = {
                role: "alumni",
                name: row.name.trim(),
                email: row.email.toLowerCase(),
                password: await bcrypt.hash(row.password || "default123", 10),
                branch: row.branch || "",
                graduationYear: parseInt(row.graduationYear) || null,
                currentCompany: row.currentCompany || "",
                designation: row.designation || "",
                location: row.location || "",
                linkedin: row.linkedin || "",
                status: "Verified",
                isProfileComplete: true,
                college: req.user._id
            };

            await Alumni.updateOne(
                { email: alumniDoc.email, college: req.user._id },
                { $set: alumniDoc },
                { upsert: true }
            );
        }

        res.redirect("/college/alumni");
    } catch (error) {
        console.error("Error uploading Excel:", error);
        res.status(500).send("Server Error");
    }
});

router.get('/download/csv', isLoggedIn, async (req, res) => {
    try {

        const alumni = await Alumni.find({ role: 'alumni', college: req.user._id }).lean();

        if (alumni.length === 0) {
            return res.status(404).send("No alumni data found for your college");
        }

        const fields = ['name', 'email', 'branch', 'graduationYear', 'currentCompany', 'designation', 'location', 'linkedin', 'status'];
        const parser = new Parser({ fields });
        const csvData = parser.parse(alumni);

        res.header('Content-Type', 'text/csv');
        res.attachment('alumni_data.csv');
        return res.send(csvData);

    } catch (error) {
        console.error("Error generating CSV:", error);
        res.status(500).send("Server Error");
    }
});

router.get('/download/excel', isLoggedIn, async (req, res) => {
    try {

        const alumni = await Alumni.find({ role: 'alumni', college: req.user._id }).lean();

        if (alumni.length === 0) {
            return res.status(404).send("No alumni data found for your college");
        }

        const worksheet = XLSX.utils.json_to_sheet(alumni);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Alumni');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('alumni_data.xlsx');
        res.send(buffer);

    } catch (error) {
        console.error("Error generating Excel:", error);
        res.status(500).send("Server Error");
    }
});

router.get('/jobIntern', isLoggedIn, async (req, res) => {
    try {

        const alumniFromCollege = await Alumni.find({ college: req.user._id }).select('_id');
        const alumniIds = alumniFromCollege.map(a => a._id);

        const jobs = await Job.find({ postedBy: { $in: alumniIds } }).populate('postedBy', 'name');

        res.render('college/jobIntern', {
            jobs: jobs
        });
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).send("Server Error");
    }
});


router.get('/jobs/new', (req, res) => {
    res.send("This is the page to create a new job posting.");
});


router.get('/donations', isLoggedIn, (req, res) => {
    const sampleCampaigns = [
        {
            title: 'Tech Lab Modernization',
            raised: 850000,
            goal: 1500000,
            daysLeft: 45,
            imageUrl: 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=800&q=80'
        },
        {
            title: 'Student Scholarship Fund',
            raised: 210000,
            goal: 500000,
            daysLeft: 60,
            imageUrl: 'https://newhorizonindia.edu/wp-content/uploads/2024/08/download-15-1024x683.png'
        },
    ];

    const donationStats = {
        totalRaised: 1060000,
        totalDonors: 478,
    };

    res.render('college/donations', {
        campaigns: sampleCampaigns,
        stats: donationStats
    });
});
router.get('/campaigns/new', (req, res) => {
    res.send("This is the page to create a new campaign.");
});


router.get('/verification', isLoggedIn, async (req, res) => {
    try {

        const pendingAlumni = await Alumni.find({ status: 'Pending', college: req.user._id });
        const pendingStudents = await Student.find({ status: 'Pending', college: req.user._id });

        res.render('college/verification', {
            alumniRequests: pendingAlumni,
            studentRequests: pendingStudents
        });
    } catch (error) {
        console.error("Error fetching verification requests:", error);
        res.status(500).send("Server Error");
    }
});

router.post('/verification/approve/:id', isLoggedIn, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.query;

        if (role === 'alumni') {
            await Alumni.findOneAndUpdate({ _id: id, college: req.user._id }, { status: 'Verified' });
        } else if (role === 'student') {
            await Student.findOneAndUpdate({ _id: id, college: req.user._id }, { status: 'Verified' });
        }

        console.log(`Approved ${role} with ID: ${id}`);
        res.redirect('/college/verification');
    } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).send("Server Error");
    }
});

router.post('/verification/reject/:id', isLoggedIn, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.query;

        if (role === 'alumni') {
            await Alumni.findOneAndUpdate({ _id: id, college: req.user._id }, { status: 'Rejected' });
        } else if (role === 'student') {
            await Student.findOneAndUpdate({ _id: id, college: req.user._id }, { status: 'Rejected' });
        }

        console.log(`Rejected ${role} with ID: ${id}`);
        res.redirect('/college/verification');
    } catch (error) {
        console.error("Error rejecting request:", error);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
