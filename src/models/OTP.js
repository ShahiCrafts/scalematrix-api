const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['email_verification', 'password_reset'],
      default: 'email_verification',
    },
    attemptsLeft: {
      type: Number,
      default: 3,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // MongoDB TTL: automatically deletes document after 10 minutes (600 seconds)
    },
  },
  {
    timestamps: false,
  }
);

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
