const mongoose = require('mongoose');

const messagePartSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['text', 'reasoning', 'tool-call', 'tool-result'],
    required: true,
  },
  text: { type: String, default: '' },
  reasoning: { type: String, default: '' },
  toolCall: {
    id: { type: String },
    name: { type: String },
    args: { type: mongoose.Schema.Types.Mixed },
  },
  toolResult: {
    toolCallId: { type: String },
    name: { type: String },
    output: { type: mongoose.Schema.Types.Mixed },
  },
}, { _id: false });

const messageMetadataSchema = new mongoose.Schema({
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  creditsUsed: { type: Number, default: 0 },
  requestedModel: { type: String, default: '' },
  effectiveModel: { type: String, default: '' },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system', 'tool'],
    required: true,
  },
  content: { type: String, default: '' },
  parts: [messagePartSchema],
  metadata: { type: messageMetadataSchema, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const threadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New Chat',
  },
  titleSource: {
    type: String,
    enum: ['auto', 'user'],
    default: 'auto',
  },
  messages: [messageSchema],
  messageCount: {
    type: Number,
    default: 0,
  },
  lastMessagePreview: {
    type: String,
    default: '',
  },
  starred: {
    type: Boolean,
    default: false,
  },
  shareId: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

threadSchema.pre('save', function () {
  if (this.messages && this.messages.length > 0) {
    this.messageCount = this.messages.length;
    const lastMsg = this.messages[this.messages.length - 1];
    this.lastMessagePreview = lastMsg.content ? lastMsg.content.slice(0, 150) : '';
  }
});

module.exports = mongoose.model('Thread', threadSchema);
