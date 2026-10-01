const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'pending_approval'],
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = Membership;
