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
    resume: { type: Buffer, required: true },
    resumeMimeType: { type: String },
    resumeName: { type: String },
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