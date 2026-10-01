const mongoose = require('mongoose');
const CryptoUtils = require('../utils/CryptoUtils');

const socialAccountSchema = new mongoose.Schema(
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
      index: true,
    },
    provider: {
      type: String,
      enum: ['meta', 'linkedin', 'twitter', 'tiktok', 'youtube', 'pinterest', 'threads', 'whatsapp'],
      required: true,
      index: true,
    },
    platformAccountId: {
      type: String, // e.g. Page ID, Instagram Business ID, User ID
      required: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: ['facebook_page', 'instagram_business', 'instagram_creator', 'messenger', 'user_profile', 'threads_account'],
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    // Encrypted Tokens
    encryptedAccessToken: {
      type: String,
      required: true,
      select: false,
    },
    encryptedRefreshToken: {
      type: String,
      default: '',
      select: false,
    },
    tokenExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    scopes: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['connected', 'expired', 'revoked', 'error', 'reconnect_required'],
      default: 'connected',
      index: true,
    },
    // Metadata for Connected Pages / Businesses
    parentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SocialAccount',
      default: null,
    },
    businessId: {
      type: String,
      default: '',
    },
    platformMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt token prior to saving
socialAccountSchema.pre('save', function () {
  if (this.isModified('encryptedAccessToken') && this.encryptedAccessToken) {
    if (!this.encryptedAccessToken.includes(':')) {
      this.encryptedAccessToken = CryptoUtils.encrypt(this.encryptedAccessToken);
    }
  }
  if (this.isModified('encryptedRefreshToken') && this.encryptedRefreshToken) {
    if (!this.encryptedRefreshToken.includes(':')) {
      this.encryptedRefreshToken = CryptoUtils.encrypt(this.encryptedRefreshToken);
    }
  }
});

// Method to get decrypted Access Token
socialAccountSchema.methods.getDecryptedToken = function () {
  return CryptoUtils.decrypt(this.encryptedAccessToken);
};

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;
