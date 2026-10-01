const assert = require('assert');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Thread = require('../src/models/Thread');
const User = require('../src/models/User');
const ComposioAgentTools = require('../src/services/ai/ComposioAgentTools');
const ModelProviderFactory = require('../src/services/ai/ModelProviderFactory');

async function testChatComposioIntegration() {
  console.log('🧪 Running Integration Test: Streaming Chat Agent & Composio 10-App Allowlist Enforcer...');

  const mockUserId = new mongoose.Types.ObjectId();
  const mockWorkspaceId = new mongoose.Types.ObjectId();

  // 1. Create a Thread in MongoDB
  const thread = await Thread.create({
    userId: mockUserId,
    title: 'Google Calendar Event Request',
    messages: [
      {
        id: `msg_user_1`,
        role: 'user',
        content: 'Add an event to my Google Calendar for team sync tomorrow at 10 AM',
        createdAt: new Date(),
      },
    ],
  });

  assert.ok(thread._id, 'Thread should be created in MongoDB');
  assert.strictEqual(thread.userId.toString(), mockUserId.toString(), 'Thread must be scoped to userId');
  console.log(`  ✓ Thread successfully created in MongoDB: ${thread._id}`);

  // 2. Test Meta Tool COMPOSIO_SEARCH_TOOLS (Strict 10-App Allowlist Assertion)
  console.log('  Testing COMPOSIO_SEARCH_TOOLS allowlist filtering...');
  const searchResult = await ComposioAgentTools.executeMetaTool(
    'COMPOSIO_SEARCH_TOOLS',
    { query: 'calendar' },
    { userId: mockUserId, workspaceId: mockWorkspaceId }
  );

  assert.strictEqual(searchResult.success, true, 'Search tools meta tool should return success');
  assert.strictEqual(searchResult.allowlistEnforced, true, 'Allowlist enforcement flag must be true');

  // Assert every single toolkit in search results is inside the 10-app allowlist
  for (const item of searchResult.tools) {
    const isAllowed = ComposioAgentTools.ALLOWED_TOOLKITS.includes(item.toolkit.toLowerCase());
    assert.ok(
      isAllowed,
      `Toolkit '${item.toolkit}' returned by search must be inside ScaleMatrix 10-app allowlist!`
    );
  }
  console.log(`  ✓ COMPOSIO_SEARCH_TOOLS verified: strictly limited to authorized 10 apps.`);

  // 3. Test Meta Tool COMPOSIO_MANAGE_CONNECTIONS (Unconnected Toolkit OAuth Flow Trigger)
  console.log('  Testing COMPOSIO_MANAGE_CONNECTIONS connection initiation trigger...');
  const manageResult = await ComposioAgentTools.executeMetaTool(
    'COMPOSIO_MANAGE_CONNECTIONS',
    {
      toolkits: [{ action: 'add', name: 'googlecalendar' }],
    },
    { userId: mockUserId, workspaceId: mockWorkspaceId }
  );

  assert.strictEqual(manageResult.success, true, 'Manage connections meta tool should return success');
  assert.ok(Array.isArray(manageResult.results), 'Results should be an array');
  assert.strictEqual(manageResult.results.length, 1, 'Should return 1 connection result');

  const connItem = manageResult.results[0];
  assert.strictEqual(connItem.toolkit, 'googlecalendar');
  assert.ok(
    connItem.status === 'connection_initiated' || connItem.status === 'already_connected',
    `Status should be connection_initiated or already_connected, got: ${connItem.status}`
  );
  if (connItem.status === 'connection_initiated') {
    assert.ok(connItem.redirectUrl, 'Must return clickable authorization / redirect URL');
  } else {
    console.log(`  ✓ Composio check-before-create correctly recognized existing active connection for googlecalendar`);
  }

  console.log(`  ✓ COMPOSIO_MANAGE_CONNECTIONS verified: generated auth redirect URL -> ${connItem.redirectUrl}`);

  // 4. Test Rejecting Unauthorized Toolkit Outside 10-App Allowlist
  console.log('  Testing COMPOSIO_MANAGE_CONNECTIONS rejection of unauthorized toolkit...');
  const rejectResult = await ComposioAgentTools.executeMetaTool(
    'COMPOSIO_MANAGE_CONNECTIONS',
    {
      toolkits: [{ action: 'add', name: 'unauthorized_app_xyz' }],
    },
    { userId: mockUserId, workspaceId: mockWorkspaceId }
  );

  assert.strictEqual(rejectResult.results[0].status, 'rejected', 'Unauthorized toolkit must be rejected');
  console.log('  ✓ COMPOSIO_MANAGE_CONNECTIONS verified: rejected app outside 10-app allowlist');

  // 5. Test Model Provider Stream Generation Heuristics
  console.log('  Testing Local Ollama Model Provider Stream Generation...');
  const provider = ModelProviderFactory.getProvider('qwen2.5:7b');
  const stream = provider.generateStream({
    messages: thread.messages,
    tools: ComposioAgentTools.getToolDefinitions(),
    options: { modelId: 'qwen2.5:7b' },
  });

  let eventsReceived = [];
  for await (const chunk of stream) {
    eventsReceived.push(chunk.type);
  }

  assert.ok(eventsReceived.includes('usage'), 'Stream must emit usage metadata chunk');
  assert.ok(eventsReceived.includes('finish'), 'Stream must emit finish chunk');
  console.log(`  ✓ Model provider stream verified: received events -> [${eventsReceived.join(', ')}]`);

  // Clean up test thread
  await Thread.deleteOne({ _id: thread._id });

  console.log('✅ PASS: Integration test passed! Streaming Chat Agent & 10-App Allowlist Composio integration fully functional.');
}

if (require.main === module) {
  const dbUri = env.MONGODB_URI || 'mongodb://localhost:27017/scalematrix';
  mongoose.connect(dbUri).then(async () => {
    try {
      await testChatComposioIntegration();
    } finally {
      await mongoose.disconnect();
    }
  }).catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
  });
}

module.exports = testChatComposioIntegration;
