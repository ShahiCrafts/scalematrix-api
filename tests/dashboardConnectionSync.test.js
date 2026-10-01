const mongoose = require('mongoose');
const assert = require('assert');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const Connection = require('../src/models/Connection');
const DashboardLayout = require('../src/models/DashboardLayout');
const WidgetBinding = require('../src/models/WidgetBinding');
const DashboardMetricService = require('../src/services/DashboardMetricService');
const { getLayout } = require('../src/controllers/dashboardController');

async function testDashboardConnectionSync() {
  console.log('🧪 Testing Real-Time Dashboard Layout Auto-Sync for New Tool Connections...');

  await mongoose.connect(env.MONGODB_URI);

  try {
    const timestamp = Date.now();

    // 1. Seed definitions catalog
    await DashboardMetricService.seedWidgetDefinitions();

    // 2. Create User and Workspace
    const testUser = await User.create({
      email: `sync_user_${timestamp}@acme.com`,
      fullName: 'Sync Test User',
      isEmailVerified: true,
    });

    const testWorkspace = await Workspace.create({
      name: 'Sync Test Workspace',
      slug: `sync-test-${timestamp}`,
      owner: testUser._id,
      teamSize: '2-10',
      setupCompletedAt: new Date(),
    });
    testUser.activeOrganization = testWorkspace._id;
    await testUser.save();

    // Mock Express Controller request/response helpers
    const invokeGetLayout = async () => {
      let responseData = null;
      const req = { user: testUser };
      const res = {
        status: () => res,
        json: (payload) => {
          responseData = payload;
          return res;
        },
      };

      await new Promise((resolve, reject) => {
        getLayout(req, res, (err) => {
          if (err) reject(err);
        });
        const checkTimer = setInterval(() => {
          if (responseData) {
            clearInterval(checkTimer);
            resolve();
          }
        }, 20);
      });

      return responseData?.data;
    };

    // 3. Initial call to getLayout (no active connections exist yet -> default layout created)
    const initialData = await invokeGetLayout();
    assert.ok(initialData.layout, 'Layout document created');
    assert.ok(initialData.widgetBindings.length > 0, 'Initial widget bindings returned');

    const initialKeys = initialData.widgetBindings.map((b) => b.appProviderKey?.toLowerCase());
    assert.ok(!initialKeys.includes('github'), 'GitHub widgets should not exist initially');
    console.log('  ✓ Initial layout generated with default widgets');

    // 4. Connect a new app (GitHub) and mark connection status as 'ACTIVE' in MongoDB
    await Connection.create({
      workspaceId: testWorkspace._id,
      composioEntityId: testWorkspace._id.toString(),
      composioConnectionId: `conn_github_${timestamp}`,
      appProviderKey: 'github',
      accountLabel: 'GitHub Account',
      status: 'ACTIVE',
      connectedBy: testUser._id,
    });
    console.log('  ✓ Marked GitHub connection as ACTIVE in MongoDB');

    // 5. Subsequent call to getLayout (should detect active GitHub connection missing from layout and auto-sync)
    const updatedData = await invokeGetLayout();
    assert.ok(updatedData.widgetBindings, 'Updated widget bindings returned');

    const updatedKeys = updatedData.widgetBindings.map((b) => b.appProviderKey?.toLowerCase());
    assert.ok(
      updatedKeys.includes('github'),
      `Updated layout must contain GitHub widget bindings! Found keys: ${updatedKeys.join(', ')}`
    );

    const githubBinding = updatedData.widgetBindings.find((b) => b.appProviderKey?.toLowerCase() === 'github');
    assert.strictEqual(githubBinding.metricKey, 'open_pull_requests');
    assert.strictEqual(githubBinding.title, 'Open Pull Requests');

    console.log('  ✓ getLayout auto-detected newly ACTIVE connection and returned new GitHub widget binding');

    // Cleanup
    await User.findByIdAndDelete(testUser._id);
    await Workspace.findByIdAndDelete(testWorkspace._id);
    await Connection.deleteMany({ workspaceId: testWorkspace._id });
    await DashboardLayout.deleteMany({ workspaceId: testWorkspace._id });
    await WidgetBinding.deleteMany({ workspaceId: testWorkspace._id });

    console.log('✅ PASS: Real-time Dashboard Connection Sync test passed successfully!');
  } catch (err) {
    console.error('❌ Dashboard Connection Sync test failed:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

testDashboardConnectionSync();
