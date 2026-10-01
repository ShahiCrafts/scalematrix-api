const mongoose = require('mongoose');

const workflowStepSchema = new mongoose.Schema(
  {
    stepId: { type: String, required: true },
    providerId: { type: String, required: true },
    actionKey: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'draft'],
      default: 'draft',
    },
    trigger: {
      providerId: { type: String, required: true },
      triggerKey: { type: String, required: true },
      config: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    steps: [workflowStepSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

workflowSchema.index({ workspaceId: 1, status: 1 });

const Workflow = mongoose.model('Workflow', workflowSchema);

module.exports = Workflow;
