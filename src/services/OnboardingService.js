const Workspace = require('../models/Workspace');
const Membership = require('../models/Membership');
const User = require('../models/User');
const Connection = require('../models/Connection');
const Subscription = require('../models/Subscription');
const UsageCounter = require('../models/UsageCounter');
const AuditLog = require('../models/AuditLog');
const Invite = require('../models/Invite');
const ApiError = require('../utils/ApiError');
const { hashString, generateNumericOTP } = require('../utils/crypto');

class OnboardingService {
  /**
   * Required Workspace Creation & Trial Activation (Task 2 & 4)
   * Unconditionally creates a new Workspace for the user with zero domain matching.
   */
  static async createWorkspaceWithTrial(userId, { name, teamSize, industry = '', referralSource = '' }, req) {
    if (!name || !name.trim()) {
      throw ApiError.badRequest('Workspace name is required.');
    }
    if (!teamSize) {
      throw ApiError.badRequest('Team size selection is required.');
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    // Generate unique slug with collision suffix if needed
    let slugBase = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slugBase) slugBase = 'workspace';
    let slug = slugBase;
    let count = 1;

    while (await Workspace.exists({ slug })) {
      slug = `${slugBase}-${count}`;
      count += 1;
    }

    const setupCompletedAt = new Date();

    // Create Workspace
    const workspace = await Workspace.create({
      name: name.trim(),
      slug,
      owner: user._id,
      teamSize,
      industry: industry ? industry.trim() : '',
      referralSource: referralSource ? referralSource.trim() : '',
      planSlug: 'trial',
      setupCompletedAt,
      isOnboarded: true,
      onboarding: {
        currentStep: 'completed',
        completedAt: setupCompletedAt,
      },
    });

    // Create Owner Membership
    await Membership.create({
      workspaceId: workspace._id,
      userId: user._id,
      role: 'owner',
      status: 'active',
    });

    // Initialize 14-Day Free Trial Subscription (Task 4)
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const subscription = await Subscription.create({
      workspaceId: workspace._id,
      planSlug: 'trial',
      status: 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
    });

    // Initialize UsageCounter
    const periodKey = new Date().toISOString().slice(0, 7);
    await UsageCounter.create({
      workspaceId: workspace._id,
      periodKey,
      toolCallsCount: 0,
      activeConnectionsCount: 0,
    });

    // Write AuditLog (Task 4)
    try {
      const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || '';
      await AuditLog.create({
        userId: user._id,
        workspaceId: workspace._id,
        action: 'workspace.created',
        ipAddress,
        userAgent: req?.headers?.['user-agent'] || '',
        metadata: {
          planSlug: 'trial',
          trialEndsAt,
          teamSize,
          industry,
          referralSource,
        },
      });
    } catch (err) {
      console.warn('⚠️ Audit log creation error:', err.message);
    }

    // Set user's active workspace
    user.activeOrganization = workspace._id;
    await user.save();

    return {
      message: 'Workspace created and 14-day trial activated successfully!',
      workspace,
      subscription,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        activeOrganization: workspace._id,
      },
    };
  }

  /**
   * Team Invites as part of onboarding flow (Task 3)
   */
  static async sendOnboardingInvites(userId, { workspaceId, invites = [] }) {
    if (!invites || !Array.isArray(invites) || invites.length === 0) {
      return { message: 'No invites to send', createdInvites: [] };
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const createdInvites = [];
    for (const item of invites) {
      if (!item.email || !item.email.includes('@')) continue;
      const email = item.email.toLowerCase().trim();
      const role = ['admin', 'member', 'viewer'].includes(item.role) ? item.role : 'member';

      const tokenCode = generateNumericOTP(12);
      const tokenHash = hashString(tokenCode);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await Invite.create({
        workspaceId,
        email,
        role,
        tokenHash,
        invitedBy: user._id,
        status: 'pending',
        expiresAt,
      });

      createdInvites.push({
        id: invite._id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      });
    }

    return {
      message: `Successfully created ${createdInvites.length} team invite(s)`,
      createdInvites,
    };
  }

  /**
   * Get user onboarding and setup status
   */
  static async getOnboardingStatus(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    let workspace = null;
    let membership = null;

    if (user.activeOrganization) {
      workspace = await Workspace.findById(user.activeOrganization);
      if (workspace) {
        membership = await Membership.findOne({ workspaceId: workspace._id, userId: user._id });
      }
    }

    if (!workspace) {
      // Find any workspace user belongs to via explicit Invite acceptance
      membership = await Membership.findOne({ userId: user._id, status: 'active' });
      if (membership) {
        workspace = await Workspace.findById(membership.workspaceId);
        if (workspace) {
          user.activeOrganization = workspace._id;
          await user.save();
        }
      }
    }

    const setupCompleted = Boolean(workspace && workspace.setupCompletedAt && membership && membership.status === 'active');

    return {
      setupCompleted,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        activeOrganization: user.activeOrganization,
      },
      workspace: workspace ? {
        id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
        teamSize: workspace.teamSize,
        industry: workspace.industry,
        referralSource: workspace.referralSource,
        planSlug: workspace.planSlug,
        setupCompletedAt: workspace.setupCompletedAt,
        isOnboarded: workspace.isOnboarded,
      } : null,
      membershipStatus: membership ? membership.status : null,
    };
  }
}

module.exports = OnboardingService;
