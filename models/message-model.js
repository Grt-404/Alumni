const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true
    },
    // The user who sent the message
    from: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'fromModel' // Dynamic reference based on the 'fromModel' field
    },
    // The user who received the message
    to: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'toModel' // Dynamic reference based on the 'toModel' field
    },
    // Specifies which model 'from' refers to ('student' or 'alumni')
    fromModel: {
        type: String,
        required: true,
        enum: ['student', 'alumni']
    },
    // Specifies which model 'to' refers to ('student' or 'alumni')
    toModel: {
        type: String,
        required: true,
        enum: ['student', 'alumni']
    },
    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'college',
        required: true
    }
}, {
    // This option automatically adds `createdAt` and `updatedAt` fields
    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
