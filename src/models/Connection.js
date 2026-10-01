const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    composioEntityId: {
      type: String,
      required: true,
      index: true,
    },
    composioConnectionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    appProviderKey: {
      type: String,
      required: true,
      index: true,
    },
    accountLabel: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'INITIATED', 'FAILED', 'DISCONNECTED'],
      default: 'ACTIVE',
      index: true,
    },
    connectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    lastErrorAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

connectionSchema.index({ workspaceId: 1, appProviderKey: 1 });

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection;
