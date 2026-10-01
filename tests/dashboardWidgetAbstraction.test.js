const mongoose = require('mongoose');
const assert = require('assert');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Workspace = require('../src/models/Workspace');
const WidgetDefinition = require('../src/models/WidgetDefinition');
const WidgetBinding = require('../src/models/WidgetBinding');
const DashboardLayout = require('../src/models/DashboardLayout');
const Connection = require('../src/models/Connection');
const DashboardMetricService = require('../src/services/DashboardMetricService');

async function testDashboardWidgetAbstraction() {
  console.log('🧪 Testing Part 1: Widget Abstraction Layer & Dashboard Layout System...');

  await mongoose.connect(env.MONGODB_URI);

  try {
    const testTimestamp = Date.now();

    // 1. Seed WidgetDefinition catalog
    await DashboardMetricService.seedWidgetDefinitions();
    const trendDef = await WidgetDefinition.findOne({ key: 'trend_metric' });
    assert.ok(trendDef, 'WidgetDefinition trend_metric must exist');
    assert.strictEqual(trendDef.supportedVisualization, 'number');
    console.log('  ✓ Seeded WidgetDefinition catalog (trend_metric, bar_chart, heatmap, etc.)');

    // 2. Create User and Workspace
    const testUser = await User.create({
      email: `widget_user_${testTimestamp}@acme.com`,
      fullName: 'Widget Test User',
      isEmailVerified: true,
    });

    const testWorkspace = await Workspace.create({
      name: 'Widget Test Workspace',
      slug: `widget-test-${testTimestamp}`,
      owner: testUser._id,
      teamSize: '2-10',
      setupCompletedAt: new Date(),
    });
    testUser.activeOrganization = testWorkspace._id;
    await testUser.save();

    // 3. Test metric resolution for multiple toolkits (Instagram, Gmail, Jira)
    const instagramGrowthMetric = await DashboardMetricService.resolveMetric({
      workspaceId: testWorkspace._id,
      appProviderKey: 'instagram',
      metricKey: 'growth_score',
    });
    assert.ok(instagramGrowthMetric.value, 'Instagram growth score value resolved');
    assert.strictEqual(instagramGrowthMetric.delta, '+4%');

    const gmailSentMetric = await DashboardMetricService.resolveMetric({
      workspaceId: testWorkspace._id,
      appProviderKey: 'gmail',
      metricKey: 'emails_sent_weekly',
    });
    assert.strictEqual(gmailSentMetric.value, '142');
    assert.strictEqual(gmailSentMetric.sub, 'Outbound email threads sent this week.');

    const jiraClosedMetric = await DashboardMetricService.resolveMetric({
      workspaceId: testWorkspace._id,
      appProviderKey: 'jira',
      metricKey: 'issues_closed_sprint',
    });
    assert.strictEqual(jiraClosedMetric.value, '28');
    console.log('  ✓ Generic Metric Engine resolved Instagram, Gmail, and Jira metrics into expected shapes');

    // 4. Create WidgetBindings and per-user DashboardLayout (userId set per User Decision A1)
    const binding1 = await WidgetBinding.create({
      workspaceId: testWorkspace._id,
      userId: testUser._id,
      widgetDefinitionKey: 'trend_metric',
      appProviderKey: 'instagram',
      metricKey: 'growth_score',
      title: 'Growth Score',
      position: 0,
    });

    const binding2 = await WidgetBinding.create({
      workspaceId: testWorkspace._id,
      userId: testUser._id,
      widgetDefinitionKey: 'trend_metric',
      appProviderKey: 'gmail',
      metricKey: 'emails_sent_weekly',
      title: 'Emails Sent (Weekly)',
      position: 1,
    });

    const layout = await DashboardLayout.create({
      workspaceId: testWorkspace._id,
      userId: testUser._id,
      widgetBindingIds: [binding1._id, binding2._id],
      isDefault: true,
    });

    assert.ok(layout, 'Per-user DashboardLayout created');
    assert.strictEqual(layout.userId.toString(), testUser._id.toString(), 'DashboardLayout must be per-user private (userId set)');
    assert.strictEqual(layout.widgetBindingIds.length, 2);
    console.log('  ✓ Created per-user DashboardLayout and bound WidgetBindings');

    // Cleanup
    await User.deleteOne({ _id: testUser._id });
    await Workspace.deleteOne({ _id: testWorkspace._id });
    await WidgetBinding.deleteMany({ workspaceId: testWorkspace._id });
    await DashboardLayout.deleteOne({ _id: layout._id });

    console.log('✅ PASS: Part 1 Widget Abstraction Layer tests passed!');
  } finally {
    await mongoose.disconnect();
  }
}

testDashboardWidgetAbstraction().catch((err) => {
  console.error('❌ FAIL: Part 1 Widget Abstraction Test Failed:', err);
  process.exit(1);
});
