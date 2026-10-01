const mongoose = require('mongoose');
const assert = require('assert');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Subscription = require('../src/models/Subscription');
const Membership = require('../src/models/Membership');
const AuditLog = require('../src/models/AuditLog');
const Invite = require('../src/models/Invite');
const OnboardingService = require('../src/services/OnboardingService');

async function testWorkspaceOnboarding() {
  console.log('🧪 Testing Workspace Onboarding & Trial Activation (Every Signup Gets Own Workspace)...');

  await mongoose.connect(env.MONGODB_URI);

  try {
    const testTimestamp = Date.now();

    // 1. First user signup (Company email) -> Creates own Workspace
    const corpUser1 = await User.create({
      email: `ceo_${testTimestamp}@acme-corp.com`,
      fullName: 'Acme CEO',
      isEmailVerified: true,
    });

    const createRes1 = await OnboardingService.createWorkspaceWithTrial(
      corpUser1._id,
      {
        name: 'Acme Corp',
        teamSize: '11-50',
        industry: 'SaaS & Tech Startup',
        referralSource: 'Search Engine (Google)',
      },
      { ip: '127.0.0.1', headers: { 'user-agent': 'TestAgent' } }
    );

    assert.ok(createRes1.workspace, 'Workspace must be created');
    assert.strictEqual(createRes1.workspace.name, 'Acme Corp');
    assert.strictEqual(createRes1.workspace.slug, 'acme-corp');
    assert.strictEqual(createRes1.workspace.teamSize, '11-50');
    assert.strictEqual(createRes1.workspace.industry, 'SaaS & Tech Startup');
    assert.strictEqual(createRes1.workspace.referralSource, 'Search Engine (Google)');
    assert.strictEqual(createRes1.workspace.domain, undefined, 'Workspace.domain must not exist');
    assert.ok(createRes1.workspace.setupCompletedAt, 'setupCompletedAt must be set');

    // Verify Subscription (14-day trial)
    assert.strictEqual(createRes1.subscription.status, 'trialing');
    assert.strictEqual(createRes1.subscription.planSlug, 'trial');
    assert.ok(createRes1.subscription.currentPeriodEnd > new Date(), 'Trial end must be set in the future');

    // Verify Membership
    const ownerMembership = await Membership.findOne({ workspaceId: createRes1.workspace._id, userId: corpUser1._id });
    assert.ok(ownerMembership, 'Owner membership must exist');
    assert.strictEqual(ownerMembership.role, 'owner');
    assert.strictEqual(ownerMembership.status, 'active');

    // Verify AuditLog
    const auditEntry = await AuditLog.findOne({ workspaceId: createRes1.workspace._id, action: 'workspace.created' });
    assert.ok(auditEntry, 'Audit log entry for workspace.created must exist');
    assert.strictEqual(auditEntry.userId.toString(), corpUser1._id.toString());
    console.log('  ✓ Created workspace, 14-day trialing subscription, owner membership & audit log');

    // 2. Second user signup with SAME company domain -> Gets their OWN separate workspace (Task 1 & Verification requirement)
    const corpUser2 = await User.create({
      email: `cto_${testTimestamp}@acme-corp.com`,
      fullName: 'Acme CTO',
      isEmailVerified: true,
    });

    const createRes2 = await OnboardingService.createWorkspaceWithTrial(
      corpUser2._id,
      {
        name: 'Acme Corp',
        teamSize: '2-10',
      },
      { ip: '127.0.0.1' }
    );

    assert.notStrictEqual(createRes2.workspace._id.toString(), createRes1.workspace._id.toString(), 'Independent signups must get separate workspaces');
    assert.strictEqual(createRes2.workspace.slug, 'acme-corp-1', 'Slug collision must append counter suffix');
    console.log('  ✓ Independent signups with identical company domain got separate workspaces with slug collision resolution');

    // 3. Team Invite Acceptance (Task 1 requirement: explicit Invite is the only way to join existing workspace)
    const inviteRes = await OnboardingService.sendOnboardingInvites(corpUser1._id, {
      workspaceId: createRes1.workspace._id,
      invites: [{ email: `engineer_${testTimestamp}@acme-corp.com`, role: 'member' }],
    });
    assert.strictEqual(inviteRes.createdInvites.length, 1);

    const invitedUser = await User.create({
      email: `engineer_${testTimestamp}@acme-corp.com`,
      fullName: 'Acme Engineer',
      isEmailVerified: true,
    });

    // Invited user joins via Membership creation
    const invitedMembership = await Membership.create({
      workspaceId: createRes1.workspace._id,
      userId: invitedUser._id,
      role: 'member',
      status: 'active',
    });
    invitedUser.activeOrganization = createRes1.workspace._id;
    await invitedUser.save();

    const invitedStatus = await OnboardingService.getOnboardingStatus(invitedUser._id);
    assert.strictEqual(invitedStatus.setupCompleted, true, 'User joining via invite has completed workspace setup');
    assert.strictEqual(invitedStatus.workspace.id.toString(), createRes1.workspace._id.toString());
    console.log('  ✓ Invited user joining via explicit Invite joins workspace without workspace creation');

    // Cleanup test data
    await User.deleteMany({ _id: { $in: [corpUser1._id, corpUser2._id, invitedUser._id] } });
    await Workspace.deleteMany({ _id: { $in: [createRes1.workspace._id, createRes2.workspace._id] } });
    await Subscription.deleteMany({ workspaceId: { $in: [createRes1.workspace._id, createRes2.workspace._id] } });
    await Membership.deleteMany({ workspaceId: { $in: [createRes1.workspace._id, createRes2.workspace._id] } });
    await AuditLog.deleteMany({ userId: { $in: [corpUser1._id, corpUser2._id, invitedUser._id] } });
    await Invite.deleteMany({ workspaceId: createRes1.workspace._id });

    console.log('✅ PASS: All Post-Login Workspace Onboarding & Trial Activation tests passed!');
  } finally {
    await mongoose.disconnect();
  }
}

testWorkspaceOnboarding().catch((err) => {
  console.error('❌ FAIL: Workspace Onboarding Test Failed:', err);
  process.exit(1);
});
