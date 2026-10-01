const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    signatureVerified: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'dead_letter'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 1,
    },
    errorLog: {
      type: String,
      default: '',
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

webhookLogSchema.index({ createdAt: -1 });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog;
