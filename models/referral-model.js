const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'student',
        required: true
    },
    alumnus: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'alumni',
        required: true
    },
    company: { type: String, required: true },
    jobLink: { type: String },
    message: { type: String },
    // We store the file as a Buffer (binary data) directly in Mongo
    resume: { type: Buffer, required: true },
    resumeMimeType: { type: String }, // e.g., 'application/pdf'
    resumeName: { type: String },     // e.g., 'resume.pdf'
    status: {
        type: String,
        enum: ['Pending', 'Reviewed', 'Accepted', 'Rejected'],
        default: 'Pending'
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'college',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Referral', referralSchema);