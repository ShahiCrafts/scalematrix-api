const mongoose = require('mongoose');

const socialPostSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      index: true,
    },
    postType: {
      type: String,
      enum: ['post', 'image', 'video', 'carousel', 'reel', 'story'],
      default: 'post',
    },
    caption: {
      type: String,
      default: '',
    },
    mediaUrls: [
      {
        url: String,
        mediaType: { type: String, enum: ['image', 'video'] },
        containerId: String,
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'publishing', 'published', 'failed', 'deleted'],
      default: 'draft',
      index: true,
    },
    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    platformPostId: {
      type: String,
      default: '',
      index: true,
    },
    permalink: {
      type: String,
      default: '',
    },
    errorReason: {
      type: String,
      default: '',
    },
    campaign: {
      type: String,
      default: '',
    },
    labels: [String],
    crossPostTargets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SocialAccount',
      },
    ],
  },
  {
    timestamps: true,
  }
);

const SocialPost = mongoose.model('SocialPost', socialPostSchema);

module.exports = SocialPost;
