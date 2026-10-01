const mongoose = require('mongoose');

const socialInboxSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ['message', 'comment'],
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    platformId: {
      type: String, // Message or Comment ID on Meta
      required: true,
      unique: true,
      index: true,
    },
    sender: {
      id: String,
      name: String,
      username: String,
      avatar: String,
    },
    recipient: {
      id: String,
      name: String,
    },
    content: {
      text: { type: String, default: '' },
      attachments: [
        {
          type: { type: String, enum: ['image', 'video', 'audio', 'file'] },
          payloadUrl: String,
        },
      ],
    },
    postId: {
      type: String, // Parent post ID if this is a comment
      default: '',
    },
    parentId: {
      type: String, // Parent comment ID if threaded reply
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    labels: [String],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const SocialInbox = mongoose.model('SocialInbox', socialInboxSchema);

module.exports = SocialInbox;
