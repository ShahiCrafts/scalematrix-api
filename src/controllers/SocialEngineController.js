const SocialEngineService = require('../services/SocialEngineService');
const SocialProviderFactory = require('../services/social');
const SocialAccount = require('../models/SocialAccount');
const SocialPost = require('../models/SocialPost');
const SocialInsight = require('../models/SocialInsight');
const SocialInbox = require('../models/SocialInbox');
const WebhookLog = require('../models/WebhookLog');
const CryptoUtils = require('../utils/CryptoUtils');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const Logger = require('../utils/logger');

class SocialEngineController {
  // 1. OAuth Workflow Endpoints
  static getAuthorizationUrl = asyncHandler(async (req, res) => {
    const { provider = 'meta', channel = 'instagram' } = req.query;
    const organizationId = req.user.activeOrganization;

    if (!organizationId) {
      throw ApiError.badRequest('User must belong to an active organization to connect social accounts.');
    }

    const authUrl = SocialEngineService.getAuthorizationUrl({
      provider,
      channel,
      user: req.user,
      organizationId,
    });

    res.json(new ApiResponse(200, { authUrl }, 'Authorization URL generated successfully.'));
  });

  static handleOAuthCallback = asyncHandler(async (req, res) => {
    const { provider = 'meta' } = req.params;
    const { code, state, error_reason, error_message, error_description } = req.query;

    if (error_reason || error_message || error_description) {
      const errMsg = error_description || error_message || error_reason;
      Logger.warn(`OAuth Authorization Denied/Cancelled by User or Meta: ${errMsg}`);
      return res.redirect(`${env.CLIENT_URL}/dashboard/settings?status=social_error&error=${encodeURIComponent(errMsg)}`);
    }

    const connectedAccounts = await SocialEngineService.handleOAuthCallback({
      provider,
      code,
      state,
    });

    // Redirect user back to frontend settings page with success parameter
    res.redirect(`${env.CLIENT_URL}/dashboard/settings?status=social_connected&count=${connectedAccounts.length}`);
  });

  static getConnectedAccounts = asyncHandler(async (req, res) => {
    const organizationId = req.user.activeOrganization;
    const accounts = await SocialEngineService.getConnectedAccounts({ organizationId });
    res.json(new ApiResponse(200, accounts, 'Connected social accounts retrieved.'));
  });

  static disconnectAccount = asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const organizationId = req.user.activeOrganization;

    const result = await SocialEngineService.disconnectAccount({ organizationId, accountId });
    res.json(new ApiResponse(200, result, 'Social account disconnected successfully.'));
  });

  // 2. Content Publishing & Scheduling
  static publishContent = asyncHandler(async (req, res) => {
    const { accountId, postType = 'post', caption, mediaUrls = [], scheduledFor, crossPostTargets = [] } = req.body;
    const organizationId = req.user.activeOrganization;

    if (!accountId) throw ApiError.badRequest('accountId is required.');

    const result = await SocialEngineService.publishOrSchedulePost({
      organizationId,
      user: req.user,
      accountId,
      postType,
      caption,
      mediaUrls,
      scheduledFor,
      crossPostTargets,
    });

    res.json(new ApiResponse(201, result, scheduledFor ? 'Post scheduled successfully.' : 'Post published successfully.'));
  });

  static getPosts = asyncHandler(async (req, res) => {
    const organizationId = req.user.activeOrganization;
    const { status, limit = 20, page = 1 } = req.query;

    const query = { organization: organizationId };
    if (status) query.status = status;

    const posts = await SocialPost.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('socialAccount', 'name username avatar provider accountType');

    const total = await SocialPost.countDocuments(query);

    res.json(new ApiResponse(200, { posts, total, page: parseInt(page), limit: parseInt(limit) }, 'Posts retrieved successfully.'));
  });

  // 3. Analytics & Historical Metrics
  static getAnalytics = asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const organizationId = req.user.activeOrganization;

    const account = await SocialAccount.findOne({ _id: accountId, organization: organizationId });
    if (!account) throw ApiError.notFound('Social account not found.');

    const insights = await SocialInsight.find({ socialAccount: accountId }).sort({ recordedAt: -1 }).limit(100);

    res.json(new ApiResponse(200, { account, insights }, 'Social analytics retrieved successfully.'));
  });

  static syncAnalytics = asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const organizationId = req.user.activeOrganization;

    const syncedRecords = await SocialEngineService.syncAnalytics({ organizationId, accountId });
    res.json(new ApiResponse(200, syncedRecords, 'Social analytics synchronized successfully.'));
  });

  // 4. Unified Social Inbox (Comments & Messages)
  static getInbox = asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const organizationId = req.user.activeOrganization;

    const inboxItems = await SocialEngineService.fetchAndSyncInbox({ organizationId, accountId });
    res.json(new ApiResponse(200, inboxItems, 'Social inbox items retrieved successfully.'));
  });

  static replyToInboxItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { message } = req.body;
    const organizationId = req.user.activeOrganization;

    if (!message) throw ApiError.badRequest('Message content is required.');

    const result = await SocialEngineService.replyToInboxItem({
      organizationId,
      inboxItemId: itemId,
      replyText: message,
    });

    res.json(new ApiResponse(200, result, 'Reply sent successfully.'));
  });

  // 5. Meta Webhook Delivery Engine
  static verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.META_WEBHOOK_VERIFY_TOKEN) {
      Logger.info('Meta Webhook Challenge Verification Successful!');
      return res.status(200).send(challenge);
    }
    return res.status(403).json(new ApiResponse(403, null, 'Webhook challenge verification failed.'));
  };

  static handleWebhookEvent = asyncHandler(async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = JSON.stringify(req.body);

    // Signature Verification
    if (env.META_APP_SECRET) {
      const isValid = CryptoUtils.verifyWebhookSignature(rawBody, signature, env.META_APP_SECRET);
      if (!isValid) {
        Logger.warn('Invalid Webhook Signature Received on Meta Webhook Endpoint');
        return res.status(401).json(new ApiResponse(401, null, 'Invalid webhook signature.'));
      }
    }

    const payload = req.body;
    const eventId = req.headers['x-entity-id'] || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Record Webhook Delivery Log
    const webhookLog = await WebhookLog.create({
      provider: 'meta',
      eventId,
      eventType: payload.object || 'unknown',
      payload,
      status: 'pending',
    });

    // Process Async via Social Engine Registry
    try {
      const metaProvider = SocialProviderFactory.getProvider('meta');
      const processedEvents = metaProvider.processWebhookEvent(payload);

      webhookLog.status = 'processed';
      webhookLog.processedAt = new Date();
      await webhookLog.save();

      Logger.info(`Processed ${processedEvents.length} webhook event(s) for eventId [${eventId}]`);
    } catch (err) {
      webhookLog.status = 'failed';
      webhookLog.errorLog = err.message;
      await webhookLog.save();
    }

    res.status(200).json({ received: true });
  });
}

module.exports = SocialEngineController;
