const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const feedbackSchema = new Schema({
  type: { type: String, enum: ["feature-request", "bug-report", "general-feedback"], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, {collection: 'feedbacks'});

const Feedback = mongoose.model("Feedback", feedbackSchema);

module.exports = Feedback;
