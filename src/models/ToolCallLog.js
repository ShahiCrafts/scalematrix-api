const mongoose = require('mongoose');

const toolCallLogSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      default: null,
    },
    providerId: {
      type: String,
      required: true,
      index: true,
    },
    actionKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'error', 'throttled'],
      default: 'success',
      index: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    creditsUsed: {
      type: Number,
      default: 1,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// High-performance compound index for metering and compliance auditing
toolCallLogSchema.index({ workspaceId: 1, createdAt: -1 });

const ToolCallLog = mongoose.model('ToolCallLog', toolCallLogSchema);

module.exports = ToolCallLog;
