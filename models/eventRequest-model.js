const mongoose = require('mongoose');

const eventRequestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'student', required: true },
  upvotes: { type: Number, default: 0 },
  upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'student' }], // track who upvoted
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'college',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('EventRequest', eventRequestSchema);
