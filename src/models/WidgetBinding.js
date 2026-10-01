const mongoose = require('mongoose');

const widgetBindingSchema = new mongoose.Schema(
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
    widgetDefinitionKey: {
      type: String,
      required: true,
      index: true,
    },
    appProviderKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Connection',
      default: null,
    },
    metricKey: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    position: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

widgetBindingSchema.index({ workspaceId: 1, userId: 1, position: 1 });

const WidgetBinding = mongoose.model('WidgetBinding', widgetBindingSchema);

module.exports = WidgetBinding;
