const SocialPost = require('../models/SocialPost');
const SocialAccount = require('../models/SocialAccount');
const SocialEngineService = require('./SocialEngineService');
const Logger = require('../utils/logger');

class SchedulerService {
  /**
   * Background runner executing scheduled publishing jobs & token health checks
   */
  static startScheduler(intervalMs = 60000) {
    Logger.info(`Starting Social Engine Publishing Scheduler (Interval: ${intervalMs}ms)`);
    
    setInterval(async () => {
      try {
        await this.processScheduledPosts();
        await this.autoRefreshExpiringTokens();
      } catch (err) {
        Logger.error('Error during Social Engine background cron execution:', err);
      }
    }, intervalMs);
  }

  /**
   * Process and publish scheduled posts whose scheduledFor time has elapsed
   */
  static async processScheduledPosts() {
    const duePosts = await SocialPost.find({
      status: 'scheduled',
      scheduledFor: { $lte: new Date() },
    }).limit(20);

    if (duePosts.length === 0) return;

    Logger.info(`Found ${duePosts.length} due scheduled post(s) to publish...`);

    for (const post of duePosts) {
      try {
        await SocialEngineService.publishOrSchedulePost({
          organizationId: post.organization,
          user: { _id: post.user },
          accountId: post.socialAccount,
          postType: post.postType,
          caption: post.caption,
          mediaUrls: post.mediaUrls,
          crossPostTargets: post.crossPostTargets,
        });
        Logger.info(`Successfully processed scheduled post [${post._id}]`);
      } catch (err) {
        Logger.error(`Failed to publish scheduled post [${post._id}]: ${err.message}`);
      }
    }
  }

  /**
   * Automatically refresh social account access tokens expiring within 7 days
   */
  static async autoRefreshExpiringTokens() {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiringAccounts = await SocialAccount.find({
      status: 'connected',
      tokenExpiresAt: { $lte: sevenDaysFromNow },
    }).select('+encryptedAccessToken');

    for (const acc of expiringAccounts) {
      try {
        const socialProvider = require('./social').getProvider(acc.provider);
        const refreshed = await socialProvider.refreshAccessToken({ accountToken: acc.getDecryptedToken() });
        acc.encryptedAccessToken = refreshed.accessToken;
        acc.tokenExpiresAt = refreshed.expiresAt;
        await acc.save();
        Logger.info(`Auto-refreshed token for account [${acc.name}] (${acc.provider})`);
      } catch (err) {
        acc.status = 'reconnect_required';
        await acc.save();
        Logger.warn(`Token refresh failed for [${acc.name}], marked as reconnect_required.`);
      }
    }
  }
}

module.exports = SchedulerService;
