const mongoose = require('mongoose');
const assert = require('assert');
const env = require('../src/config/env');
const AppProvider = require('../src/models/AppProvider');
const Connection = require('../src/models/Connection');
const ComposioService = require('../src/services/ComposioService');

async function testIntegrationsCatalog() {
  console.log('🧪 Testing Integrations Catalog Regression (Composio v3 Toolkits Sync)...');

  await mongoose.connect(env.MONGODB_URI);

  try {
    const testTimestamp = Date.now();

    // 1. Fetch & Sync Catalog
    const catalog = await ComposioService.fetchAndSyncCatalog();
    assert.ok(catalog.length > 0, 'Catalog should contain items');

    // 2. Assert major apps exist in AppProvider
    const gmailApp = await AppProvider.findOne({ composioAppKey: 'gmail' });
    const githubApp = await AppProvider.findOne({ composioAppKey: 'github' });
    const figmaApp = await AppProvider.findOne({ composioAppKey: 'figma' });

    assert.ok(gmailApp, 'Gmail app provider must exist in catalog');
    assert.ok(githubApp, 'GitHub app provider must exist in catalog');
    assert.ok(figmaApp, 'Figma app provider must exist in catalog');

    // 3. Assert category mappings
    assert.strictEqual(gmailApp.category, 'Communication', 'Gmail category should be Communication');
    assert.strictEqual(githubApp.category, 'Developer Tools', 'GitHub category should be Developer Tools');
    assert.strictEqual(figmaApp.category, 'Design', 'Figma category should be Design');

    // 4. Test join with active connections (e.g., connected Gmail)
    const mockWorkspaceId = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();
    await Connection.create({
      workspaceId: mockWorkspaceId,
      composioEntityId: mockWorkspaceId.toString(),
      composioConnectionId: `conn_gmail_${testTimestamp}`,
      appProviderKey: 'gmail',
      accountLabel: 'Gmail Account',
      status: 'ACTIVE',
      connectedBy: mockUserId,
    });

    const activeConnections = await Connection.find({
      workspaceId: mockWorkspaceId,
      status: 'ACTIVE',
    });

    const connectedKeys = new Set(activeConnections.map((c) => c.appProviderKey.toLowerCase()));

    assert.ok(connectedKeys.has(gmailApp.composioAppKey), 'Gmail must show as connected for the workspace');

    console.log('  ✓ Catalog contains real toolkits (Gmail, GitHub, Figma)');
    console.log('  ✓ Categories mapped correctly (Communication, Developer Tools, Design)');
    console.log('  ✓ Active connection joins correctly identify connected apps');

    // Cleanup mock connection
    await Connection.deleteMany({ workspaceId: mockWorkspaceId });

    console.log('✅ Integrations Catalog regression tests PASSED successfully!');
  } catch (error) {
    console.error('❌ Integrations Catalog test failed:', error);
    process.exitCode = 1;
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

testIntegrationsCatalog();
