const Organization = require('../models/Organization');
const SocialAccount = require('../models/SocialAccount');
const SocialPost = require('../models/SocialPost');
const ApiError = require('../utils/ApiError');

class EntitlementService {
  /**
   * Plan feature quota maps
   */
  static getPlanLimits(plan) {
    const limits = {
      trial: { maxSocialAccounts: 3, monthlyPosts: 30, enableAnalytics: true, enableAutomation: false },
      starter: { maxSocialAccounts: 5, monthlyPosts: 100, enableAnalytics: true, enableAutomation: true },
      pro: { maxSocialAccounts: 15, monthlyPosts: 1000, enableAnalytics: true, enableAutomation: true },
      agency: { maxSocialAccounts: 100, monthlyPosts: 50000, enableAnalytics: true, enableAutomation: true },
    };
    return limits[plan] || limits.trial;
  }

  /**
   * Enforce social account connection entitlement
   */
  static async validateAccountConnectionQuota(organizationId) {
    const org = await Organization.findById(organizationId);
    if (!org) throw ApiError.notFound('Organization not found.');

    const limits = this.getPlanLimits(org.subscription?.plan);
    const currentAccountCount = await SocialAccount.countDocuments({ organization: organizationId });

    if (currentAccountCount >= limits.maxSocialAccounts) {
      throw ApiError.forbidden(
        `Subscription Entitlement Limit Reached: Your current plan '${org.subscription.plan}' allows up to ${limits.maxSocialAccounts} connected accounts. Please upgrade to connect additional social accounts.`
      );
    }
    return true;
  }

  /**
   * Enforce publishing quota
   */
  static async validatePublishingQuota(organizationId) {
    const org = await Organization.findById(organizationId);
    if (!org) throw ApiError.notFound('Organization not found.');

    const limits = this.getPlanLimits(org.subscription?.plan);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const currentMonthPostCount = await SocialPost.countDocuments({
      organization: organizationId,
      status: 'published',
      publishedAt: { $gte: startOfMonth },
    });

    if (currentMonthPostCount >= limits.monthlyPosts) {
      throw ApiError.forbidden(
        `Subscription Entitlement Limit Reached: Monthly post quota of ${limits.monthlyPosts} posts reached for plan '${org.subscription.plan}'.`
      );
    }
    return true;
  }
}

module.exports = EntitlementService;
