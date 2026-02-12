// models/alumni-model.js
const { mongoose, Schema } = require('../config/mongoose-connection');

const alumniSchema = new Schema({
    role: { type: String, default: 'alumni' },
    name: String,
    email: String,
    contact: Number,
    password: {
        type: String,
        required: function () { return !this.linkedinId; }
    },
    image: { type: Buffer },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'college' },
    status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },
    points: { type: Number, default: 0 },

    // --- AI RECOMMENDER FIELDS ---
    age: { type: Number, default: 25 },
    gender: { type: String, enum: ["Male", "Female", "Other", "missing"], default: "missing" },
    graduationYear: Number,
    branch: String,
    currentCompany: String,
    designation: String,

    // New fields for AI Alignment
    seniority: { type: String, enum: ["Entry", "Mid", "Senior", "Director", "Executive"], default: "Mid" },
    industry: { type: String, default: "Technology" },
    location: { type: String, default: "Remote" },
    companySize: { type: Number, default: 500 }, // Python: Company_Size_Employees
    bio: { type: String, default: "" }, // Python: Business_Interests
    objectives: { type: String, default: "Mentoring students" },
    constraints: { type: String, default: "Weekends only" },

    // --- NETWORKING ---
    linkedin: { type: String, default: "" },
    invitations: [{ type: mongoose.Schema.Types.ObjectId, ref: "student" }],
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "student" }],
});

module.exports = mongoose.model("alumni", alumniSchema);