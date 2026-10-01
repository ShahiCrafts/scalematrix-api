const assert = require('assert');
const mongoose = require('mongoose');
const ComposioService = require('../src/services/ComposioService');
const env = require('../src/config/env');

async function testComposioV3Integration() {
  console.log('🧪 Testing Composio v3 Integration Engine & Regression Tests...');

  // 1. Verify v3 Base URL Configuration
  assert.ok(env.COMPOSIO_BASE_URL.includes('/v3'), 'COMPOSIO_BASE_URL must target /api/v3');

  // 2. Test Catalog Sync against Composio v3 API
  try {
    const catalog = await ComposioService.fetchAndSyncCatalog();
    assert.ok(Array.isArray(catalog), 'Catalog response should be an array');
    console.log(`  ✓ Successfully synced ${catalog.length} app catalog entries from Composio v3 API`);
  } catch (err) {
    console.error('  ❌ Catalog sync error:', err.message);
    throw err;
  }

  // 3. Regression Test: Initiating connections for 3 different toolkits MUST produce 3 DIFFERENT redirect URLs & auth_config_ids!
  console.log('🧪 Running Regression Test: Testing distinct connection links for GitHub, Gmail, and Figma...');

  const mockWorkspaceId = new mongoose.Types.ObjectId();
  const mockUserId = new mongoose.Types.ObjectId();

  const toolkitsToTest = ['github', 'gmail', 'figma'];
  const results = {};

  for (const toolkit of toolkitsToTest) {
    const res = await ComposioService.initiateConnection(mockWorkspaceId, toolkit, mockUserId);
    assert.ok(res.connection, `Connection object must be returned for ${toolkit}`);
    assert.ok(res.redirectUrl, `Redirect URL must be returned for ${toolkit}`);
    results[toolkit] = res.redirectUrl;
    console.log(`  ✓ Generated ${toolkit} connection redirect URL: ${res.redirectUrl}`);
  }

  // Assert all 3 redirect URLs are distinct and not equal to each other!
  assert.notStrictEqual(results.github, results.gmail, 'GitHub and Gmail redirect URLs must be distinct!');
  assert.notStrictEqual(results.github, results.figma, 'GitHub and Figma redirect URLs must be distinct!');
  assert.notStrictEqual(results.gmail, results.figma, 'Gmail and Figma redirect URLs must be distinct!');

  console.log('✅ PASS: Regression test passed! Each toolkit generates a unique, distinct Composio authorization link!');
}

if (require.main === module) {
  mongoose.connect(env.MONGODB_URI).then(async () => {
    try {
      await testComposioV3Integration();
    } finally {
      await mongoose.disconnect();
    }
  }).catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
  });
}

module.exports = testComposioV3Integration;
