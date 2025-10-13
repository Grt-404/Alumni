// models/student-model.js

const { mongoose, Schema } = require('../config/mongoose-connection');

const studentSchema = new Schema({
    role: {
        type: String,
        default: 'student'
    },
    fullname: String,
    email: String,
    contact: Number,
    password: {
        type: String,
        required: function() {
            return !this.linkedinId;
        }
    },
    image: {
        type: Buffer,
        required: false
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'college'
    },
    status: {
        type: String,
        enum: ['Pending', 'Verified', 'Rejected'],
        default: 'Pending'
    },

    linkedinId: {
        type: String,
        unique: true,
        sparse: true // Allows multiple students to not have a LinkedIn ID
    },


    // --- NEW/UPDATED FIELDS FOR CONNECTIONS ---

    // Stores IDs of alumni the student has sent a request to.
    sentRequests: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "alumni" // Correctly referencing the 'alumni' model
    }],

    // Stores IDs of alumni the student is connected with.
    connections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "alumni" // Correctly referencing the 'alumni' model
    }],

    branch: {
        type: String,
        default: ''
    },
    interests: {
        type: [String], // Defines an array of strings
        default: []
    },

    linkedin: { type: String, default: "" },
});

module.exports = mongoose.model("student", studentSchema);