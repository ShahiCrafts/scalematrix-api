const mongoose = require('mongoose');

const usageCounterSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    periodKey: {
      type: String, // Format: YYYY-MM (e.g. 2026-09)
      required: true,
      index: true,
    },
    toolCallsCount: {
      type: Number,
      default: 0,
    },
    activeConnectionsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

usageCounterSchema.index({ workspaceId: 1, periodKey: 1 }, { unique: true });

const UsageCounter = mongoose.model('UsageCounter', usageCounterSchema);

module.exports = UsageCounter;
