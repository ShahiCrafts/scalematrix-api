const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    priceMonthly: {
      type: Number,
      required: true,
      default: 0,
    },
    maxConnections: {
      type: Number,
      required: true,
      default: 5,
    },
    maxToolCallsPerMonth: {
      type: Number,
      required: true,
      default: 1000,
    },
    maxTeamMembers: {
      type: Number,
      required: true,
      default: 3,
    },
    features: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
