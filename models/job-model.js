const { mongoose, Schema } = require('../config/mongoose-connection');

const jobSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 2000
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    type: { // e.g., 'Full-time', 'Internship', 'Contract'
        type: String,
        enum: ['Full-time', 'Part-time', 'Internship', 'Contract', 'Remote'],
        default: 'Full-time'
    },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "alumni",
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Job", jobSchema);
