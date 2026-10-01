const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const UsageCounter = require('../models/UsageCounter');
const Workspace = require('../models/Workspace');
const ApiError = require('../utils/ApiError');

class SubscriptionService {
  /**
   * Get workspace current subscription plan & rolling usage details
   */
  static async getWorkspaceSubscription(workspaceId) {
    let subscription = await Subscription.findOne({ workspaceId });
    if (!subscription) {
      // Create trial subscription fallback if missing
      subscription = await Subscription.create({
        workspaceId,
        planSlug: 'trial',
        status: 'trialing',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });
    }

    const plan = (await Plan.findOne({ slug: subscription.planSlug })) || {
      name: 'Free Trial',
      slug: 'trial',
      priceMonthly: 0,
      maxConnections: 5,
      maxToolCallsPerMonth: 1000,
      maxTeamMembers: 3,
    };

    const periodKey = new Date().toISOString().slice(0, 7);
    const usage = (await UsageCounter.findOne({ workspaceId, periodKey })) || {
      toolCallsCount: 0,
      activeConnectionsCount: 0,
    };

    return {
      subscription: {
        planSlug: subscription.planSlug,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      plan: {
        name: plan.name,
        slug: plan.slug,
        priceMonthly: plan.priceMonthly,
        limits: {
          maxConnections: plan.maxConnections,
          maxToolCallsPerMonth: plan.maxToolCallsPerMonth,
          maxTeamMembers: plan.maxTeamMembers,
        },
      },
      usage: {
        periodKey,
        toolCallsCount: usage.toolCallsCount,
        activeConnectionsCount: usage.activeConnectionsCount,
      },
    };
  }
}

module.exports = SubscriptionService;
