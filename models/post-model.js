const mongoose = require('mongoose');
const { Schema } = mongoose;

const postSchema = new Schema({
    author: {
        type: Schema.Types.ObjectId,
        ref: 'alumni',
        required: true
    },
    college: {
        type: Schema.Types.ObjectId,
        ref: 'college',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: Buffer,
    },
    likes: [{
        type: Schema.Types.ObjectId,
        ref: 'alumni'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
