const assert = require('assert');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Connection = require('../src/models/Connection');
const ComposioAgentTools = require('../src/services/ai/ComposioAgentTools');

/**
 * Regression test for Bug 1 ("Agent generates a new connect link every turn
 * instead of recognizing an existing connection").
 *
 * Root cause: ComposioService.initiateConnection() unconditionally called
 * Composio's /connected_accounts/link endpoint and unconditionally
 * findOneAndUpdate()'d the local Connection doc back to status:'INITIATED',
 * even when an ACTIVE connection already existed. Combined with
 * COMPOSIO_MANAGE_CONNECTIONS having no check-before-create step, every
 * "add" call - whether the account was already connected or not - minted a
 * brand new Composio connected_account_id and downgraded the existing
 * ACTIVE record.
 *
 * This test simulates: (1) first-ever connect attempt -> link generated,
 * (2) OAuth completes -> status flips to ACTIVE (as syncUserConnections
 * would do after polling Composio), (3) a second "add" call for the exact
 * same entity_id + toolkit (as the agent would issue on a later chat turn)
 * -> must NOT mint a new link and must NOT clobber the ACTIVE record.
 */
async function testComposioCheckBeforeCreate() {
  console.log('🧪 Testing Composio check-before-create (Bug 1 regression)...');

  const mockUserId = new mongoose.Types.ObjectId();
  const entityId = mockUserId.toString();

  // Clean slate for this entity/toolkit pair
  await Connection.deleteMany({ composioEntityId: entityId, appProviderKey: 'googlecalendar' });

  // --- Turn 1: no connection exists yet -> a link SHOULD be generated ---
  const firstAttempt = await ComposioAgentTools.executeMetaTool(
    'COMPOSIO_MANAGE_CONNECTIONS',
    { toolkits: [{ action: 'add', name: 'googlecalendar' }] },
    { userId: mockUserId, workspaceId: mockUserId }
  );

  const firstResult = firstAttempt.results[0];
  assert.strictEqual(firstResult.status, 'connection_initiated', 'First-ever connect attempt must generate a connect link');
  assert.ok(firstResult.redirectUrl, 'First attempt must return a redirect URL');
  console.log(`  ✓ Turn 1: connection_initiated with link ${firstResult.redirectUrl}`);

  const storedAfterFirst = await Connection.findOne({ composioEntityId: entityId, appProviderKey: 'googlecalendar' });
  assert.ok(storedAfterFirst, 'A Connection doc must exist after first attempt');
  const originalConnectionId = storedAfterFirst.composioConnectionId;

  // --- Simulate successful OAuth completion (what syncUserConnections
  // would do once Composio reports the connected_account as ACTIVE) ---
  storedAfterFirst.status = 'ACTIVE';
  await storedAfterFirst.save();

  // --- Turn 2: agent calls COMPOSIO_MANAGE_CONNECTIONS "add" again for the
  // SAME entity_id + toolkit (this is exactly what triggered Bug 1) ---
  const secondAttempt = await ComposioAgentTools.executeMetaTool(
    'COMPOSIO_MANAGE_CONNECTIONS',
    { toolkits: [{ action: 'add', name: 'googlecalendar' }] },
    { userId: mockUserId, workspaceId: mockUserId }
  );

  const secondResult = secondAttempt.results[0];
  assert.strictEqual(secondResult.status, 'already_connected', 'Second attempt for an already-ACTIVE connection must NOT re-trigger OAuth');
  assert.ok(!secondResult.redirectUrl, 'Second attempt must NOT return a new redirect/auth link');
  console.log('  ✓ Turn 2: already_connected, no new link generated');

  const storedAfterSecond = await Connection.findOne({ composioEntityId: entityId, appProviderKey: 'googlecalendar' });
  assert.strictEqual(storedAfterSecond.status, 'ACTIVE', 'Connection status must remain ACTIVE, not be reset to INITIATED');
  assert.strictEqual(
    storedAfterSecond.composioConnectionId,
    originalConnectionId,
    'The original composioConnectionId must be preserved, not overwritten with a new one'
  );
  console.log('  ✓ ACTIVE status and original connectionId preserved across the second call');

  // Clean up
  await Connection.deleteMany({ composioEntityId: entityId, appProviderKey: 'googlecalendar' });

  console.log('✅ PASS: Bug 1 regression verified - repeat COMPOSIO_MANAGE_CONNECTIONS calls no longer clobber an active connection.');
}

if (require.main === module) {
  const dbUri = env.MONGODB_URI || 'mongodb://localhost:27017/scalematrix';
  mongoose.connect(dbUri).then(async () => {
    try {
      await testComposioCheckBeforeCreate();
    } finally {
      await mongoose.disconnect();
    }
  }).catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
  });
}

module.exports = testComposioCheckBeforeCreate;
