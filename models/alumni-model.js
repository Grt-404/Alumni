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
        required: true
    },
    linkedinId: { type: String },
    graduationYear: Number,
    branch: String,
    currentCompany: { type: String, default: "" },
    designation: { type: String, default: "" },
    location: { type: String, default: "" },
    bio: { type: String, maxlength: 500, default: "" },
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

    // --- NEW/UPDATED FIELDS FOR CONNECTIONS ---

    // Stores IDs of students who have sent an invitation to this alumnus.
    invitations: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "student" // Correctly referencing the 'student' model
    }],

    points: {
        type: Number,
        default: 0,
        required: true
    },
    // Stores IDs of students this alumnus is connected with.
    connections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "student" // Correctly referencing the 'student' model
    }]
});


alumniSchema.pre('validate', function (next) {
    if (this.linkedinId) {
        this.$ignore('password');
    }
    next();
});

module.exports = mongoose.model("alumni", alumniSchema);