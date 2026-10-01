const DashboardLayout = require('../models/DashboardLayout');
const WidgetBinding = require('../models/WidgetBinding');
const Connection = require('../models/Connection');
const DashboardMetricService = require('../services/DashboardMetricService');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

/**
 * Generate default WidgetBinding objects for a user's workspace based on active connections
 */
async function generateDefaultWidgetBindings(workspaceId, userId) {
  const activeConnections = await Connection.find({ workspaceId, status: 'ACTIVE' });
  const activeKeys = new Set(activeConnections.map((c) => c.appProviderKey.toLowerCase()));

  const bindingsToCreate = [];
  let pos = 0;

  // Always include Instagram defaults if connected OR if zero connections exist yet
  if (activeKeys.has('instagram') || activeKeys.size === 0) {
    bindingsToCreate.push(
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'instagram', metricKey: 'growth_score', title: 'Growth Score', position: pos++ },
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'instagram', metricKey: 'follower_growth', title: 'Followers', position: pos++ },
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'instagram', metricKey: 'reach', title: 'Monthly Reach', position: pos++ },
      { widgetDefinitionKey: 'heatmap', appProviderKey: 'instagram', metricKey: 'geographic_reach', title: 'Audience Reach Heatmap', position: pos++ },
      { widgetDefinitionKey: 'bar_chart', appProviderKey: 'instagram', metricKey: 'weekly_performance', title: 'Weekly Performance', position: pos++ }
    );
  }

  if (activeKeys.has('gmail')) {
    bindingsToCreate.push(
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'gmail', metricKey: 'emails_sent_weekly', title: 'Emails Sent (Weekly)', position: pos++ },
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'gmail', metricKey: 'emails_received_weekly', title: 'Emails Received', position: pos++ },
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'gmail', metricKey: 'avg_response_time', title: 'Avg Response Time', position: pos++ }
    );
  }

  if (activeKeys.has('jira') || activeKeys.has('linear')) {
    const key = activeKeys.has('jira') ? 'jira' : 'linear';
    bindingsToCreate.push(
      { widgetDefinitionKey: 'trend_metric', appProviderKey: key, metricKey: 'issues_closed_sprint', title: 'Sprint Issues Closed', position: pos++ },
      { widgetDefinitionKey: 'trend_metric', appProviderKey: key, metricKey: 'cycle_time', title: 'Issue Cycle Time', position: pos++ }
    );
  }

  if (activeKeys.has('github')) {
    bindingsToCreate.push(
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'github', metricKey: 'open_pull_requests', title: 'Open Pull Requests', position: pos++ }
    );
  }

  if (activeKeys.has('googlecalendar')) {
    bindingsToCreate.push(
      { widgetDefinitionKey: 'trend_metric', appProviderKey: 'googlecalendar', metricKey: 'upcoming_meetings_count', title: 'Meetings This Week', position: pos++ }
    );
  }

  const createdBindings = [];
  for (const b of bindingsToCreate) {
    const created = await WidgetBinding.create({
      workspaceId,
      userId,
      widgetDefinitionKey: b.widgetDefinitionKey,
      appProviderKey: b.appProviderKey,
      metricKey: b.metricKey,
      title: b.title,
      position: b.position,
    });
    createdBindings.push(created);
  }

  return createdBindings;
}

const getLayout = asyncHandler(async (req, res) => {
  const workspaceId = req.user.activeOrganization;
  if (!workspaceId) {
    return res.status(200).json(new ApiResponse(200, { layout: null, widgetBindings: [], metrics: {} }, 'No active workspace selected'));
  }

  // Ensure definitions are seeded
  await DashboardMetricService.seedWidgetDefinitions();

  let layout = await DashboardLayout.findOne({ workspaceId, userId: req.user._id }).populate('widgetBindingIds');

  const activeConnections = await Connection.find({ workspaceId, status: 'ACTIVE' });
  const activeKeys = new Set(activeConnections.map((c) => c.appProviderKey.toLowerCase()));

  // Check if active connections exist that aren't present in default layout
  const existingAppKeys = new Set(
    (layout?.widgetBindingIds || [])
      .map((b) => b?.appProviderKey?.toLowerCase())
      .filter(Boolean)
  );
  const isMissingActiveApp = Array.from(activeKeys).some((key) => !existingAppKeys.has(key));

  if (!layout || !layout.widgetBindingIds || layout.widgetBindingIds.length === 0 || (layout.isDefault && isMissingActiveApp)) {
    // Clean old default bindings and regenerate to include newly connected apps
    await WidgetBinding.deleteMany({ workspaceId, userId: req.user._id });
    const newBindings = await generateDefaultWidgetBindings(workspaceId, req.user._id);

    layout = await DashboardLayout.findOneAndUpdate(
      { workspaceId, userId: req.user._id },
      {
        workspaceId,
        userId: req.user._id,
        widgetBindingIds: newBindings.map((b) => b._id),
        isDefault: true,
      },
      { upsert: true, new: true }
    ).populate('widgetBindingIds');
  }

  // Resolve metrics for each binding
  const metrics = {};
  for (const binding of layout.widgetBindingIds) {
    if (!binding) continue;
    const metricData = await DashboardMetricService.resolveMetric({
      workspaceId,
      appProviderKey: binding.appProviderKey,
      metricKey: binding.metricKey,
      config: binding.config,
    });
    metrics[binding._id] = metricData;
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        layout,
        widgetBindings: layout.widgetBindingIds,
        metrics,
        metricCatalog: DashboardMetricService.getMetricCatalog(),
      },
      'Dashboard layout and metrics fetched successfully'
    )
  );
});

const getMetrics = asyncHandler(async (req, res) => {
  const workspaceId = req.user.activeOrganization;
  const layout = await DashboardLayout.findOne({ workspaceId, userId: req.user._id }).populate('widgetBindingIds');
  if (!layout) {
    return res.status(200).json(new ApiResponse(200, {}, 'No dashboard layout found'));
  }

  const metrics = {};
  for (const binding of layout.widgetBindingIds) {
    if (!binding) continue;
    metrics[binding._id] = await DashboardMetricService.resolveMetric({
      workspaceId,
      appProviderKey: binding.appProviderKey,
      metricKey: binding.metricKey,
      config: binding.config,
    });
  }

  res.status(200).json(new ApiResponse(200, metrics, 'Metrics resolved successfully'));
});

const updateWidgetBinding = asyncHandler(async (req, res) => {
  const workspaceId = req.user.activeOrganization;
  const { bindingId } = req.params;
  const { title, appProviderKey, metricKey, widgetDefinitionKey, config } = req.body;

  const binding = await WidgetBinding.findOne({ _id: bindingId, workspaceId, userId: req.user._id });
  if (!binding) {
    throw ApiError.notFound('Widget binding slot not found');
  }

  if (title) binding.title = title;
  if (appProviderKey) binding.appProviderKey = appProviderKey;
  if (metricKey) binding.metricKey = metricKey;
  if (widgetDefinitionKey) binding.widgetDefinitionKey = widgetDefinitionKey;
  if (config) binding.config = config;

  await binding.save();

  // Mark layout as customized (isDefault: false)
  await DashboardLayout.updateOne({ workspaceId, userId: req.user._id }, { isDefault: false });

  const resolvedData = await DashboardMetricService.resolveMetric({
    workspaceId,
    appProviderKey: binding.appProviderKey,
    metricKey: binding.metricKey,
    config: binding.config,
  });

  res.status(200).json(new ApiResponse(200, { binding, metric: resolvedData }, 'Widget slot updated successfully'));
});

module.exports = {
  getLayout,
  getMetrics,
  updateWidgetBinding,
};
