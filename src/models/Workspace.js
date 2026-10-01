const mongoose = require('mongoose');

const onboardingProgressSchema = new mongoose.Schema(
  {
    currentStep: {
      type: String,
      enum: ['signup', 'activation', 'completed'],
      default: 'activation',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Workspace name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planSlug: {
      type: String,
      default: 'trial',
    },
    onboarding: {
      type: onboardingProgressSchema,
      default: () => ({ currentStep: 'activation', completedAt: null }),
    },
    teamSize: {
      type: String,
      enum: ['1', '2-10', '11-50', '51-200', '200+'],
      default: '1',
    },
    setupCompletedAt: {
      type: Date,
      default: null,
    },
    industry: {
      type: String,
      default: '',
      trim: true,
    },
    referralSource: {
      type: String,
      default: '',
      trim: true,
    },
    targetAudience: {
      type: [String],
      default: [],
    },
    businessGoals: {
      type: [String],
      default: [],
    },
    isOnboarded: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
