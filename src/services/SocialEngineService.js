const SocialProviderFactory = require('../services/social');
const SocialAccount = require('../models/SocialAccount');
const SocialPost = require('../models/SocialPost');
const SocialInsight = require('../models/SocialInsight');
const SocialInbox = require('../models/SocialInbox');
const EntitlementService = require('../services/EntitlementService');
const ApiError = require('../utils/ApiError');
const Logger = require('../utils/logger');
const crypto = require('crypto');

class SocialEngineService {
  // 1. OAuth Workflow
  static getAuthorizationUrl({ provider = 'meta', channel = 'instagram', user, organizationId }) {
    const socialProvider = SocialProviderFactory.getProvider(provider);

    // Cryptographic state vector containing organization & user context
    const statePayload = {
      orgId: organizationId,
      userId: user._id.toString(),
      provider,
      nonce: crypto.randomBytes(16).toString('hex'),
      createdAt: Date.now(),
    };

    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');
    return socialProvider.getAuthorizationUrl({ state, channel });
  }

  static async handleOAuthCallback({ provider = 'meta', code, state }) {
    if (!state || !code) {
      throw ApiError.badRequest('OAuth Callback Missing required code or state parameter.');
    }

    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch (e) {
      throw ApiError.badRequest('Invalid OAuth state parameter.');
    }

    const { orgId, userId } = decodedState;
    await EntitlementService.validateAccountConnectionQuota(orgId);

    const socialProvider = SocialProviderFactory.getProvider(provider);
    const tokenData = await socialProvider.exchangeCodeForToken({ code });

    // Retrieve all connected accounts/pages under this OAuth authorization grant
    const connectedAccounts = await socialProvider.getConnectedAccounts({
      accessToken: tokenData.accessToken,
    });

    const savedAccounts = [];

    for (const acc of connectedAccounts) {
      const existingAccount = await SocialAccount.findOne({
        organization: orgId,
        provider,
        platformAccountId: acc.platformAccountId,
      });

      if (existingAccount) {
        existingAccount.encryptedAccessToken = acc.accessToken;
        existingAccount.tokenExpiresAt = acc.tokenExpiresAt;
        existingAccount.status = 'connected';
        existingAccount.name = acc.name;
        existingAccount.avatar = acc.avatar;
        existingAccount.lastSyncedAt = new Date();
        await existingAccount.save();
        savedAccounts.push(existingAccount);
      } else {
        const newAccount = await SocialAccount.create({
          organization: orgId,
          user: userId,
          provider,
          platformAccountId: acc.platformAccountId,
          accountType: acc.accountType,
          name: acc.name,
          username: acc.username,
          avatar: acc.avatar,
          encryptedAccessToken: acc.accessToken,
          tokenExpiresAt: acc.tokenExpiresAt,
          status: 'connected',
          platformMetadata: acc.platformMetadata,
        });
        savedAccounts.push(newAccount);
      }
    }

    Logger.info(`Successfully connected ${savedAccounts.length} social account(s) for Org [${orgId}]`);
    return savedAccounts;
  }

  static async disconnectAccount({ organizationId, accountId }) {
    const account = await SocialAccount.findOne({ _id: accountId, organization: organizationId });
    if (!account) throw ApiError.notFound('Social account not found.');

    account.status = 'revoked';
    await account.save();
    return { success: true, message: 'Account disconnected successfully.' };
  }

  static async getConnectedAccounts({ organizationId }) {
    return SocialAccount.find({ organization: organizationId, status: { $ne: 'revoked' } });
  }

  // 2. Publishing Engine & Scheduler
  static async publishOrSchedulePost({ organizationId, user, accountId, postType, caption, mediaUrls, scheduledFor, crossPostTargets = [] }) {
    const account = await SocialAccount.findOne({ _id: accountId, organization: organizationId }).select('+encryptedAccessToken');
    if (!account) throw ApiError.notFound('Social account not found.');

    await EntitlementService.validatePublishingQuota(organizationId);

    // If scheduled for future
    if (scheduledFor && new Date(scheduledFor) > new Date()) {
      const scheduledPost = await SocialPost.create({
        organization: organizationId,
        user: user._id,
        socialAccount: accountId,
        provider: account.provider,
        postType,
        caption,
        mediaUrls,
        status: 'scheduled',
        scheduledFor: new Date(scheduledFor),
        crossPostTargets,
      });
      return scheduledPost;
    }

    // Direct Instant Publishing
    const socialProvider = SocialProviderFactory.getProvider(account.provider);

    const postDoc = await SocialPost.create({
      organization: organizationId,
      user: user._id,
      socialAccount: accountId,
      provider: account.provider,
      postType,
      caption,
      mediaUrls,
      status: 'publishing',
      crossPostTargets,
    });

    try {
      const publishResult = await socialProvider.publishPost({
        account,
        postType,
        caption,
        mediaUrls,
      });

      postDoc.status = 'published';
      postDoc.publishedAt = new Date();
      postDoc.platformPostId = publishResult.platformPostId;
      postDoc.permalink = publishResult.permalink || '';
      await postDoc.save();

      Logger.info(`Published Social Post [${postDoc._id}] on ${account.provider}`);
      return postDoc;
    } catch (err) {
      postDoc.status = 'failed';
      postDoc.errorReason = err.message;
      await postDoc.save();
      throw err;
    }
  }

  // 3. Analytics Synchronization
  static async syncAnalytics({ organizationId, accountId }) {
    const account = await SocialAccount.findOne({ _id: accountId, organization: organizationId }).select('+encryptedAccessToken');
    if (!account) throw ApiError.notFound('Social account not found.');

    const socialProvider = SocialProviderFactory.getProvider(account.provider);
    const insightsData = await socialProvider.getAccountInsights({ account });

    const records = [];
    for (const item of insightsData) {
      const recorded = await SocialInsight.create({
        organization: organizationId,
        socialAccount: account._id,
        provider: account.provider,
        metricCategory: 'account',
        metricName: item.name,
        metricValue: item.values?.[0]?.value || item.values || item.value || 0,
        period: item.period || 'day',
        recordedAt: new Date(),
      });
      records.push(recorded);
    }

    return records;
  }

  // 4. Unified Social Inbox (Comments & Messages)
  static async fetchAndSyncInbox({ organizationId, accountId }) {
    const account = await SocialAccount.findOne({ _id: accountId, organization: organizationId }).select('+encryptedAccessToken');
    if (!account) throw ApiError.notFound('Social account not found.');

    const socialProvider = SocialProviderFactory.getProvider(account.provider);

    // Fetch Direct Messaging Conversations
    const conversations = await socialProvider.getConversations({ account });

    for (const conv of conversations) {
      if (conv.messages?.data) {
        for (const msg of conv.messages.data) {
          await SocialInbox.updateOne(
            { platformId: msg.id },
            {
              $setOnInsert: {
                organization: organizationId,
                socialAccount: account._id,
                provider: account.provider,
                type: 'message',
                conversationId: conv.id,
                platformId: msg.id,
                sender: { id: msg.from?.id, name: msg.from?.name },
                content: { text: msg.message || '' },
                timestamp: new Date(msg.created_time || Date.now()),
              },
            },
            { upsert: true }
          );
        }
      }
    }

    return SocialInbox.find({ socialAccount: account._id }).sort({ timestamp: -1 });
  }

  static async replyToInboxItem({ organizationId, inboxItemId, replyText }) {
    const item = await SocialInbox.findOne({ _id: inboxItemId, organization: organizationId });
    if (!item) throw ApiError.notFound('Inbox item not found.');

    const account = await SocialAccount.findOne({ _id: item.socialAccount }).select('+encryptedAccessToken');
    if (!account) throw ApiError.notFound('Associated social account not found.');

    const socialProvider = SocialProviderFactory.getProvider(account.provider);

    if (item.type === 'message') {
      const replyMsgId = await socialProvider.sendMessage({
        account,
        recipientId: item.sender.id,
        conversationId: item.conversationId,
        message: replyText,
      });
      return { success: true, replyMsgId };
    }

    if (item.type === 'comment') {
      const replyCommentId = await socialProvider.replyToComment({
        account,
        commentId: item.platformId,
        message: replyText,
      });
      return { success: true, replyCommentId };
    }

    throw ApiError.badRequest('Unsupported inbox item type.');
  }
}

module.exports = SocialEngineService;
