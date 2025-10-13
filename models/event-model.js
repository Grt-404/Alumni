const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  location: { type: String, default: 'Google Meet' },
  gmeetLink: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'alumni', required: true },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'college',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
