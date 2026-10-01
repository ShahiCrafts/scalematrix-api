const BaseSocialProvider = require('./BaseSocialProvider');
const CryptoUtils = require('../../utils/CryptoUtils');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const Logger = require('../../utils/logger');

class MetaSocialProvider extends BaseSocialProvider {
  constructor() {
    super('meta');
    this.graphBaseUrl = `https://graph.facebook.com/${env.META_API_VERSION}`;
    this.appId = env.META_APP_ID;
    this.appSecret = env.META_APP_SECRET;
  }

  /**
   * Helper method to perform Graph API requests with appsecret_proof verification & security
   */
  async _makeGraphRequest(endpoint, options = {}, accessToken = '') {
    const url = new URL(`${this.graphBaseUrl}${endpoint}`);
    if (accessToken) {
      url.searchParams.append('access_token', accessToken);
      if (this.appSecret) {
        const proof = CryptoUtils.generateAppSecretProof(accessToken, this.appSecret);
        url.searchParams.append('appsecret_proof', proof);
      }
    }

    try {
      const response = await fetch(url.toString(), {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        const errMessage = data.error?.message || `Meta API Error (${response.status})`;
        Logger.error(`Meta Graph API Request Failed [${endpoint}]:`, data.error || data);
        throw ApiError.badRequest(`Meta Platform Error: ${errMessage}`);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      Logger.error(`Network / Exception during Meta Graph API Call: ${err.message}`);
      throw ApiError.internal(`Meta Integration Gateway Exception: ${err.message}`);
    }
  }

  // 1. OAuth Methods
  getAuthorizationUrl({ state, redirectUri, scopes = [], channel = 'instagram' }) {
    const redirect = redirectUri || env.META_OAUTH_REDIRECT_URI;

    const baseScopes = [
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
    ];

    const finalScopes = Array.from(new Set([...baseScopes, ...scopes])).join(',');
    const extras = JSON.stringify({ setup: { channel: channel === 'instagram' ? 'IG_API_ONBOARDING' : 'FB_PAGE_ONBOARDING' } });

    let oauthUrl = `https://www.facebook.com/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(
      redirect
    )}&response_type=code&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(finalScopes)}&extras=${encodeURIComponent(extras)}`;

    if (env.META_CONFIG_ID) {
      oauthUrl += `&config_id=${env.META_CONFIG_ID}`;
    }

    return oauthUrl;
  }

  async exchangeCodeForToken({ code, redirectUri }) {
    const redirect = redirectUri || env.META_OAUTH_REDIRECT_URI;
    const shortTokenUrl = `/oauth/access_token?client_id=${this.appId}&client_secret=${this.appSecret}&redirect_uri=${encodeURIComponent(
      redirect
    )}&code=${code}`;

    const shortData = await this._makeGraphRequest(shortTokenUrl);
    const shortToken = shortData.access_token;

    // Immediately exchange for long-lived access token (60 days)
    const longTokenUrl = `/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.appId}&client_secret=${this.appSecret}&fb_exchange_token=${shortToken}`;
    const longData = await this._makeGraphRequest(longTokenUrl);

    const expiresInSeconds = longData.expires_in || 5184000; // default 60 days
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      accessToken: longData.access_token,
      expiresAt,
      tokenType: longData.token_type || 'bearer',
    };
  }

  async refreshAccessToken({ accountToken }) {
    const refreshUrl = `/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.appId}&client_secret=${this.appSecret}&fb_exchange_token=${accountToken}`;
    const data = await this._makeGraphRequest(refreshUrl);
    const expiresAt = new Date(Date.now() + (data.expires_in || 5184000) * 1000);

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  }

  async getConnectedAccounts({ accessToken }) {
    const connectedAccounts = [];

    // 1. Fetch Facebook Pages & connected Instagram Business Accounts
    try {
      const pagesUrl = `/me/accounts?fields=id,name,username,picture,access_token,tasks,category,instagram_business_account{id,username,name,profile_picture_url}`;
      const pagesData = await this._makeGraphRequest(pagesUrl, {}, accessToken);

      if (pagesData.data && Array.isArray(pagesData.data)) {
        for (const page of pagesData.data) {
          // Facebook Page
          connectedAccounts.push({
            platformAccountId: page.id,
            accountType: 'facebook_page',
            name: page.name,
            username: page.username || page.id,
            avatar: page.picture?.data?.url || '',
            accessToken: page.access_token || accessToken,
            tokenExpiresAt: new Date(Date.now() + 5184000 * 1000),
            platformMetadata: {
              category: page.category,
              tasks: page.tasks,
            },
          });

          // Connected Instagram Business Account
          if (page.instagram_business_account) {
            const ig = page.instagram_business_account;
            connectedAccounts.push({
              platformAccountId: ig.id,
              accountType: 'instagram_business',
              name: ig.name || ig.username,
              username: ig.username,
              avatar: ig.profile_picture_url || '',
              accessToken: page.access_token || accessToken,
              tokenExpiresAt: new Date(Date.now() + 5184000 * 1000),
              parentPlatformId: page.id,
              platformMetadata: {
                facebookPageId: page.id,
              },
            });
          }
        }
      }
    } catch (e) {
      Logger.warn("Page lookup failed, continuing with direct Instagram account lookup...", e);
    }

    // 2. Direct Instagram Business/User Account Lookup (Instagram Basic Display / Direct Login)
    if (!connectedAccounts.some(a => a.accountType.includes('instagram'))) {
      try {
        const directIgData = await this._makeGraphRequest(`/me?fields=id,name,username,profile_picture_url`, {}, accessToken);
        if (directIgData && directIgData.id) {
          connectedAccounts.push({
            platformAccountId: directIgData.id,
            accountType: 'instagram_business',
            name: directIgData.name || directIgData.username || 'Instagram Account',
            username: directIgData.username || directIgData.id,
            avatar: directIgData.profile_picture_url || '',
            accessToken: accessToken,
            tokenExpiresAt: new Date(Date.now() + 5184000 * 1000),
            platformMetadata: {},
          });
        }
      } catch (e) {
        Logger.warn("Direct Instagram account lookup fallback skipped:", e.message);
      }
    }

    return connectedAccounts;
  }

  // 2. Publishing & Media Container Implementation
  async createMediaContainer({ account, mediaType, url, caption, isCarouselItem = false }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${account.platformAccountId}/media`;
    const params = new URLSearchParams();

    if (mediaType === 'image') {
      params.append('image_url', url);
    } else if (mediaType === 'video' || mediaType === 'reel') {
      params.append('media_type', 'REELS');
      params.append('video_url', url);
    }

    if (caption && !isCarouselItem) {
      params.append('caption', caption);
    }
    if (isCarouselItem) {
      params.append('is_carousel_item', 'true');
    }

    const data = await this._makeGraphRequest(`${endpoint}?${params.toString()}`, { method: 'POST' }, token);
    return data.id; // Media Container ID
  }

  async publishMediaContainer({ account, containerId }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${account.platformAccountId}/media_publish`;
    const params = new URLSearchParams({ creation_id: containerId });

    const data = await this._makeGraphRequest(`${endpoint}?${params.toString()}`, { method: 'POST' }, token);
    return data.id; // Platform Post ID
  }

  async publishPost({ account, postType, caption, mediaUrls = [] }) {
    const token = account.getDecryptedToken();

    // A. Instagram Business Account Publishing
    if (account.accountType === 'instagram_business' || account.accountType === 'instagram_creator') {
      if (mediaUrls.length === 0) {
        throw ApiError.badRequest('Instagram requires image or video media to publish a post.');
      }

      if (mediaUrls.length === 1) {
        const item = mediaUrls[0];
        const containerId = await this.createMediaContainer({
          account,
          mediaType: item.mediaType || 'image',
          url: item.url,
          caption,
        });
        const platformPostId = await this.publishMediaContainer({ account, containerId });
        return { platformPostId, permalink: `https://instagram.com/p/${platformPostId}` };
      }

      // Carousel Publishing
      const childContainerIds = [];
      for (const item of mediaUrls) {
        const childId = await this.createMediaContainer({
          account,
          mediaType: item.mediaType || 'image',
          url: item.url,
          isCarouselItem: true,
        });
        childContainerIds.push(childId);
      }

      const carouselEndpoint = `/${account.platformAccountId}/media`;
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
        caption,
      });

      const carouselContainer = await this._makeGraphRequest(`${carouselEndpoint}?${carouselParams.toString()}`, { method: 'POST' }, token);
      const platformPostId = await this.publishMediaContainer({ account, containerId: carouselContainer.id });
      return { platformPostId, permalink: `https://instagram.com/p/${platformPostId}` };
    }

    // B. Facebook Page Publishing
    const endpoint = `/${account.platformAccountId}/feed`;
    const params = new URLSearchParams({ message: caption });
    if (mediaUrls.length > 0) {
      params.append('link', mediaUrls[0].url);
    }

    const data = await this._makeGraphRequest(`${endpoint}?${params.toString()}`, { method: 'POST' }, token);
    return { platformPostId: data.id, permalink: `https://facebook.com/${data.id}` };
  }

  async deletePost({ account, platformPostId }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${platformPostId}`;
    const data = await this._makeGraphRequest(endpoint, { method: 'DELETE' }, token);
    return data.success || true;
  }

  // 3. Analytics & Insights
  async getAccountInsights({ account, period = 'day', metrics }) {
    const token = account.getDecryptedToken();
    let metricList = metrics;

    if (!metricList) {
      if (account.accountType.includes('instagram')) {
        metricList = ['impressions', 'reach', 'profile_views', 'follower_count', 'email_contacts'];
      } else {
        metricList = ['page_impressions', 'page_engaged_users', 'page_post_engagements', 'page_actions_post_reactions_like_total'];
      }
    }

    const endpoint = `/${account.platformAccountId}/insights?metric=${metricList.join(',')}&period=${period}`;
    const data = await this._makeGraphRequest(endpoint, {}, token);
    return data.data || [];
  }

  async getPostInsights({ account, platformPostId }) {
    const token = account.getDecryptedToken();
    let metrics = ['engagement', 'impressions', 'reach', 'saved'];
    if (account.accountType.includes('facebook')) {
      metrics = ['post_impressions', 'post_engagements', 'post_reactions_by_type_total'];
    }

    const endpoint = `/${platformPostId}/insights?metric=${metrics.join(',')}`;
    const data = await this._makeGraphRequest(endpoint, {}, token);
    return data.data || [];
  }

  // 4. Comments & Moderation
  async getComments({ account, platformPostId }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${platformPostId}/comments?fields=id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}`;
    const data = await this._makeGraphRequest(endpoint, {}, token);
    return data.data || [];
  }

  async replyToComment({ account, commentId, message }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${commentId}/replies?message=${encodeURIComponent(message)}`;
    const data = await this._makeGraphRequest(endpoint, { method: 'POST' }, token);
    return data.id;
  }

  async hideComment({ account, commentId, hide = true }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${commentId}?hide=${hide}`;
    const data = await this._makeGraphRequest(endpoint, { method: 'POST' }, token);
    return data.success || true;
  }

  async deleteComment({ account, commentId }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${commentId}`;
    const data = await this._makeGraphRequest(endpoint, { method: 'DELETE' }, token);
    return data.success || true;
  }

  // 5. Direct Messaging
  async getConversations({ account }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${account.platformAccountId}/conversations?fields=id,updated_time,unread_count,participants,messages{id,message,created_time,from}`;
    const data = await this._makeGraphRequest(endpoint, {}, token);
    return data.data || [];
  }

  async getMessages({ account, conversationId }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${conversationId}/messages?fields=id,message,created_time,from,attachments`;
    const data = await this._makeGraphRequest(endpoint, {}, token);
    return data.data || [];
  }

  async sendMessage({ account, recipientId, conversationId, message, attachmentUrl }) {
    const token = account.getDecryptedToken();
    const endpoint = `/${account.platformAccountId}/messages`;
    const body = {
      recipient: { id: recipientId },
      message: { text: message },
    };
    if (attachmentUrl) {
      body.message.attachment = {
        type: 'image',
        payload: { url: attachmentUrl, is_reusable: true },
      };
    }

    const data = await this._makeGraphRequest(endpoint, { method: 'POST', body: JSON.stringify(body) }, token);
    return data.message_id || data.id;
  }

  // 6. Process Meta Webhooks
  processWebhookEvent(payload) {
    const events = [];
    if (payload.object === 'page' || payload.object === 'instagram') {
      for (const entry of payload.entry || []) {
        // Comments & Feed changes
        if (entry.changes) {
          for (const change of entry.changes) {
            events.push({
              eventType: change.field,
              platformAccountId: entry.id,
              data: change.value,
              timestamp: new Date(entry.time * 1000),
            });
          }
        }
        // Direct Messages
        if (entry.messaging) {
          for (const msg of entry.messaging) {
            events.push({
              eventType: 'message',
              platformAccountId: entry.id,
              data: msg,
              timestamp: new Date(msg.timestamp || Date.now()),
            });
          }
        }
      }
    }
    return events;
  }
}

module.exports = MetaSocialProvider;
