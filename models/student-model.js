const { mongoose, Schema } = require('../config/mongoose-connection');

const studentSchema = new Schema({
    role: { type: String, default: 'student' },
    fullname: String,
    email: String,
    contact: Number,
    password: {
        type: String,
        required: function () { return !this.linkedinId; }
    },
    image: { type: Buffer, required: false },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'college' },
    status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },


    isProfileComplete: { type: Boolean, default: false },
    age: { type: Number, default: 20 },
    gender: { type: String, enum: ["Male", "Female", "Other", "missing"], default: "missing" },
    branch: { type: String, default: '' },


    industry: { type: String, default: "Technology" },
    location: { type: String, default: "Unknown" },
    interests: { type: [String], default: [] },
    objectives: { type: String, default: "Seeking mentorship and career guidance" },
    constraints: { type: String, default: "None" },


    linkedinId: { type: String, unique: true, sparse: true },
    linkedin: { type: String, default: "" },
    sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "alumni" }],
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "alumni" }],
});

module.exports = mongoose.model("student", studentSchema);