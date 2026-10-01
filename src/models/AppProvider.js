const mongoose = require('mongoose');

const actionTriggerSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    inputSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const appProviderSchema = new mongoose.Schema(
  {
    composioAppKey: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    composioAuthConfigId: {
      type: String,
      default: '',
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: 'General',
      index: true,
    },
    iconUrl: {
      type: String,
      default: '',
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    isNoAuth: {
      type: Boolean,
      default: false,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    availableActions: [actionTriggerSchema],
    availableTriggers: [actionTriggerSchema],
  },
  {
    timestamps: true,
  }
);

appProviderSchema.index({ isPopular: 1, isEnabled: 1 });

const AppProvider = mongoose.model('AppProvider', appProviderSchema);

module.exports = AppProvider;
