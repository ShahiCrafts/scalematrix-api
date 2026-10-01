/**
  * Base Interface Contract for all Social Media Providers (Meta, LinkedIn, Twitter, TikTok, etc.)
  * Every social platform integration MUST implement this contract.
  */
class BaseSocialProvider {
  constructor(providerName) {
    if (this.constructor === BaseSocialProvider) {
      throw new Error("Cannot instantiate abstract BaseSocialProvider class directly.");
    }
    this.providerName = providerName;
  }

  // 1. OAuth Methods
  getAuthorizationUrl({ state, redirectUri, scopes }) {
    throw new Error(`getAuthorizationUrl() not implemented in ${this.providerName}`);
  }

  exchangeCodeForToken({ code, redirectUri }) {
    throw new Error(`exchangeCodeForToken() not implemented in ${this.providerName}`);
  }

  refreshAccessToken({ refreshToken, accountToken }) {
    throw new Error(`refreshAccessToken() not implemented in ${this.providerName}`);
  }

  getConnectedAccounts({ accessToken }) {
    throw new Error(`getConnectedAccounts() not implemented in ${this.providerName}`);
  }

  // 2. Publishing & Media Container Methods
  createMediaContainer({ account, mediaType, url, caption, isCarouselItem }) {
    throw new Error(`createMediaContainer() not implemented in ${this.providerName}`);
  }

  publishMediaContainer({ account, containerId }) {
    throw new Error(`publishMediaContainer() not implemented in ${this.providerName}`);
  }

  publishPost({ account, postType, caption, mediaUrls }) {
    throw new Error(`publishPost() not implemented in ${this.providerName}`);
  }

  deletePost({ account, platformPostId }) {
    throw new Error(`deletePost() not implemented in ${this.providerName}`);
  }

  // 3. Analytics & Historical Metrics
  getAccountInsights({ account, period, metrics }) {
    throw new Error(`getAccountInsights() not implemented in ${this.providerName}`);
  }

  getPostInsights({ account, platformPostId }) {
    throw new Error(`getPostInsights() not implemented in ${this.providerName}`);
  }

  // 4. Comments & Moderation
  getComments({ account, platformPostId }) {
    throw new Error(`getComments() not implemented in ${this.providerName}`);
  }

  replyToComment({ account, commentId, message }) {
    throw new Error(`replyToComment() not implemented in ${this.providerName}`);
  }

  hideComment({ account, commentId, hide }) {
    throw new Error(`hideComment() not implemented in ${this.providerName}`);
  }

  deleteComment({ account, commentId }) {
    throw new Error(`deleteComment() not implemented in ${this.providerName}`);
  }

  // 5. Direct Messaging & Conversation Inbox
  getConversations({ account }) {
    throw new Error(`getConversations() not implemented in ${this.providerName}`);
  }

  getMessages({ account, conversationId }) {
    throw new Error(`getMessages() not implemented in ${this.providerName}`);
  }

  sendMessage({ account, recipientId, conversationId, message, attachmentUrl }) {
    throw new Error(`sendMessage() not implemented in ${this.providerName}`);
  }

  // 6. Webhook Notification Processor
  processWebhookEvent(payload) {
    throw new Error(`processWebhookEvent() not implemented in ${this.providerName}`);
  }
}

module.exports = BaseSocialProvider;
