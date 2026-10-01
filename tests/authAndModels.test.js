const assert = require('assert');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Membership = require('../src/models/Membership');
const AuditLog = require('../src/models/AuditLog');
const AppProvider = require('../src/models/AppProvider');
const Plan = require('../src/models/Plan');
const UsageCounter = require('../src/models/UsageCounter');

async function testAuthAndModels() {
  console.log('🧪 Running Auth, Data Models & Onboarding Model Tests...');

  // Test User Schema indexes & defaults
  const userPaths = Object.keys(User.schema.paths);
  assert.ok(userPaths.includes('email'), 'User should have email path');
  assert.ok(userPaths.includes('googleId'), 'User should have googleId path');
  assert.ok(userPaths.includes('githubId'), 'User should have githubId path');
  assert.strictEqual(userPaths.includes('microsoftId'), false, 'User should NOT have microsoftId path');

  // Test Workspace Schema
  const workspacePaths = Object.keys(Workspace.schema.paths);
  assert.ok(workspacePaths.includes('slug'), 'Workspace should have slug');
  assert.ok(workspacePaths.includes('onboarding'), 'Workspace should track onboarding subdocument');

  // Test Membership Schema
  const membershipPaths = Object.keys(Membership.schema.paths);
  assert.ok(membershipPaths.includes('workspaceId'), 'Membership should have workspaceId');
  assert.ok(membershipPaths.includes('userId'), 'Membership should have userId');

  // Test AuditLog Schema
  const auditPaths = Object.keys(AuditLog.schema.paths);
  assert.ok(auditPaths.includes('action'), 'AuditLog should have action');

  console.log('✅ PASS: Auth & Data Models schema verification complete!');
}

if (require.main === module) {
  testAuthAndModels().catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
  });
}

module.exports = testAuthAndModels;
