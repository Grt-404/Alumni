const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true
    },

    from: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'fromModel'
    },

    to: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'toModel'
    },

    fromModel: {
        type: String,
        required: true,
        enum: ['student', 'alumni']
    },

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

    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
