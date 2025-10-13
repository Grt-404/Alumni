// models/alumni-model.js

const { mongoose, Schema } = require('../config/mongoose-connection');

const alumniSchema = new Schema({
    name: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        // Password is not required if linkedinId is present
    },
    linkedinId: { type: String },
    graduationYear: Number,
    branch: String,
    currentCompany: { type: String, default: "" },
    designation: { type: String, default: "" },
    location: { type: String, default: "" },
    // FIX: Removed maxlength validation to allow for longer LinkedIn bios
    bio: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    role: {
        type: String,
        enum: ["alumni", "student", "admin"],
        default: "alumni"
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    image: Buffer,
    posts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post"
    }],
    status: {
        type: String,
        enum: ['Pending', 'Verified', 'Rejected'],
        default: 'Pending'
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'college'
    },
    invitations: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "student"
    }],
    points: {
        type: Number,
        default: 0,
        required: true
    },
    connections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "student"
    }]
});


alumniSchema.pre('validate', function (next) {
    if (this.linkedinId) {
        // This makes the password field optional if a linkedinId exists
        this.$ignore('password');
    }
    next();
});

module.exports = mongoose.model("alumni", alumniSchema);

