const mongoose = require('mongoose');

const socialInsightSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    socialAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialAccount',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
    },
    metricCategory: {
      type: String, // e.g. account, post, story, reel
      required: true,
    },
    metricName: {
      type: String, // e.g. followers_count, reach, impressions, engagement_rate
      required: true,
      index: true,
    },
    metricValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    period: {
      type: String,
      enum: ['day', 'week', 'days_28', 'lifetime'],
      default: 'day',
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

socialInsightSchema.index({ socialAccount: 1, metricName: 1, recordedAt: -1 });

const SocialInsight = mongoose.model('SocialInsight', socialInsightSchema);

module.exports = SocialInsight;
