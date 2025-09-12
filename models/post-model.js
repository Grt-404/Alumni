// models/post.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const postSchema = new Schema({
    author: {
        type: Schema.Types.ObjectId,
        ref: 'alumni',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    likes: [{
        type: Schema.Types.ObjectId,
        ref: 'alumni'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
