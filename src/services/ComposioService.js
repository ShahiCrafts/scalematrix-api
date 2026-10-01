const env = require('../config/env');
const AppProvider = require('../models/AppProvider');
const Connection = require('../models/Connection');
const ToolCallLog = require('../models/ToolCallLog');
const UsageCounter = require('../models/UsageCounter');
const ApiError = require('../utils/ApiError');

const DEFAULT_POPULAR_APPS = [
  'gmail',
  'googlecalendar',
  'googlemeet',
  'linkedin',
  'instagram',
  'facebook',
  'slack',
  'notion',
  'googlesheets',
  'discord',
  'trello',
];

class ComposioService {
  /**
   * Helper to perform authenticated HTTP requests to Composio v3 API
   */
  static async composioRequest(endpoint, method = 'GET', body = null) {
    if (!env.COMPOSIO_API_KEY || env.COMPOSIO_API_KEY.includes('mock')) {
      console.warn('⚠️ COMPOSIO_API_KEY is not configured or in mock mode. Returning mock Composio payload.');
      return this.getMockResponse(endpoint, method, body);
    }

    const baseUrl = env.COMPOSIO_BASE_URL.replace(/\/v1$/, '/v3');
    const url = `${baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'x-api-key': env.COMPOSIO_API_KEY,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      console.error(`❌ Composio Network Failure (${endpoint}):`, err.message);
      throw new Error(`Composio Network Failure: ${err.message}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = {};
      try {
        parsedErr = JSON.parse(errText);
      } catch (e) {
        parsedErr = { error: errText };
      }

      const errMsg = parsedErr.error?.message || parsedErr.error || errText;
      console.error(`❌ Composio v3 API Error (${response.status} on ${endpoint}):`, errMsg);

      if (response.status >= 400 && response.status < 500) {
        throw ApiError.badRequest(`Composio v3 API Error (${response.status} on ${endpoint}): ${errMsg}`);
      }

      throw ApiError.internal(`Composio Server Error (${response.status} on ${endpoint}): ${errMsg}`);
    }

    return await response.json();
  }

  /**
   * Resolve or dynamically provision a Composio-Managed Auth Config ID for a given toolkit slug
   */
  static async resolveAuthConfigId(composioAppKey) {
    const keyLower = composioAppKey.toLowerCase();

    // 1. Fetch existing Auth Configs from Composio
    const authConfigsData = await this.composioRequest('/auth_configs');
    const configs = authConfigsData.items || [];

    const matched = configs.find((cfg) => {
      const toolkitSlug = (cfg.toolkit?.slug || '').toLowerCase();
      const cfgName = (cfg.name || '').toLowerCase();
      return toolkitSlug === keyLower || cfgName.includes(`_${keyLower}_`) || cfgName.endsWith(`_${keyLower}`) || cfgName.startsWith(`${keyLower}_`);
    });

    if (matched?.id) {
      const resolvedSlug = (matched.toolkit?.slug || matched.name || '').toLowerCase();
      if (!resolvedSlug.includes(keyLower) && keyLower !== 'web_search') {
        throw ApiError.internal(`Sanity Check Failure: Resolved Auth Config '${matched.id}' (${resolvedSlug}) does not match requested toolkit '${keyLower}'`);
      }
      return matched.id;
    }

    // 2. Provision new Composio-managed auth config if none exists for this toolkit
    try {
      console.log(`🔨 Provisioning Composio-Managed Auth Config for toolkit: ${keyLower}`);
      const created = await this.composioRequest('/auth_configs', 'POST', {
        toolkit: { slug: keyLower },
        auth_scheme: 'OAUTH2',
      });
      const newId = created.auth_config?.id || created.id;
      if (newId) return newId;
    } catch (err) {
      console.warn(`⚠️ Could not auto-create auth_config for toolkit ${keyLower}:`, err.message);
    }

    throw ApiError.badRequest(`Unable to resolve or create a valid Composio Auth Config for toolkit '${composioAppKey}'`);
  }

  /**
   * Fetch full Composio toolkits catalog and cache in AppProvider collection (v3)
   */
  static async fetchAndSyncCatalog() {
    let rawToolkits = [];
    let authConfigsMap = {};

    try {
      const [toolkitsData, authConfigsData] = await Promise.all([
        this.composioRequest('/toolkits').catch(() => this.composioRequest('/tools')),
        this.composioRequest('/auth_configs').catch(() => ({ items: [] })),
      ]);

      rawToolkits = toolkitsData.items || (Array.isArray(toolkitsData) ? toolkitsData : []);
      const configs = authConfigsData.items || [];

      configs.forEach((cfg) => {
        const slug = (cfg.toolkit?.slug || cfg.name || '').toLowerCase();
        if (slug && cfg.id) {
          authConfigsMap[slug] = cfg.id;
        }
      });
    } catch (err) {
      if (err.statusCode && err.statusCode < 500) {
        throw err;
      }
      console.warn('⚠️ Unable to connect to Composio network, seeding default catalog fallback.');
      rawToolkits = this.getDefaultFallbackTools();
    }

    const CATEGORY_MAP = {
      gmail: 'Communication',
      googlecalendar: 'Productivity',
      googlemeet: 'Communication',
      linkedin: 'Social Media',
      instagram: 'Social Media',
      facebook: 'Social Media',
      slack: 'Communication',
      notion: 'Productivity',
      googlesheets: 'Productivity',
      discord: 'Communication',
      trello: 'Project Management',
    };

    const toolkitMap = new Map();

    rawToolkits.forEach((item) => {
      const toolkit = item.toolkit || item;
      const key = (toolkit.slug || item.slug || item.name || '').toLowerCase();
      if (!key) return;

      if (!toolkitMap.has(key)) {
        const defaultCategory = CATEGORY_MAP[key] || 'General';
        toolkitMap.set(key, {
          composioAppKey: key,
          composioAuthConfigId: authConfigsMap[key] || '',
          displayName: toolkit.name || item.name || key,
          category: toolkit.category || item.category || defaultCategory,
          iconUrl: toolkit.logo || item.logo || toolkit.icon || `https://logos.composio.dev/api/${key}`,
          isEnabled: true,
          isNoAuth: Boolean(item.no_auth || toolkit.no_auth),
          isPopular: DEFAULT_POPULAR_APPS.includes(key),
          availableActions: [],
          availableTriggers: [],
        });
      }
    });

    const operations = Array.from(toolkitMap.values()).map((app) => ({
      updateOne: {
        filter: { composioAppKey: app.composioAppKey },
        update: { $set: app },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await AppProvider.bulkWrite(operations);
    }

    return AppProvider.find({ isEnabled: true }).sort({ isPopular: -1, displayName: 1 });
  }

  /**
   * Initiate OAuth connection with Composio v3 (/connected_accounts/link)
   */
  static async initiateConnection(userId, composioAppKey, options = {}) {
    const { forceReconnect = false } = options;
    const entityId = userId.toString();
    const keyLower = composioAppKey.toLowerCase();
    let appProvider = await AppProvider.findOne({ composioAppKey: keyLower });

    if (!appProvider) {
      await this.fetchAndSyncCatalog();
      appProvider = await AppProvider.findOne({ composioAppKey: keyLower });
    }

    // Handle isNoAuth tools (e.g. built-in web search, browser)
    if (appProvider?.isNoAuth) {
      const existingNoAuthConn = await Connection.findOne({
        $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
        appProviderKey: keyLower,
      });

      if (existingNoAuthConn) return { connection: existingNoAuthConn, redirectUrl: null, alreadyConnected: true };

      const noAuthConn = await Connection.create({
        workspaceId: entityId,
        composioEntityId: entityId,
        composioConnectionId: `no_auth_${keyLower}_${Date.now()}`,
        appProviderKey: keyLower,
        accountLabel: `${appProvider.displayName} (Built-in)`,
        status: 'ACTIVE',
        connectedBy: entityId,
      });

      return { connection: noAuthConn, redirectUrl: null, alreadyConnected: true };
    }

    // --- Step 1: Check local MongoDB Connection cache ---
    const existingLocal = await Connection.findOne({
      $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
      appProviderKey: keyLower,
    });

    if (existingLocal && existingLocal.status === 'ACTIVE' && !forceReconnect) {
      console.log(
        `[COMPOSIO_CHECK_BEFORE_CREATE] entity_id=${entityId} toolkit=${keyLower} -> already ACTIVE locally ` +
        `(connectionId=${existingLocal.composioConnectionId}); skipping new auth link generation.`
      );
      return { connection: existingLocal, redirectUrl: null, alreadyConnected: true };
    }

    // --- Step 2: Check-before-create against live Composio API ---
    let liveConnections = [];
    try {
      const liveRes = await this.composioRequest(`/connected_accounts?user_id=${entityId}`);
      const liveItems = liveRes.items || liveRes.data || [];
      liveConnections = liveItems.filter(
        (c) => (c.toolkit?.slug || c.appName || '').toLowerCase() === keyLower
      );
    } catch (err) {
      console.warn(`⚠️ Could not verify live Composio connections for entity_id=${entityId} toolkit=${keyLower}:`, err.message);
    }

    console.log(
      `[COMPOSIO_PRE_LINK_CHECK] entity_id=${entityId} toolkit=${keyLower} existingConnections=` +
      JSON.stringify(liveConnections.map((c) => ({ id: c.id, status: c.status })))
    );

    const activeLive = !forceReconnect && liveConnections.find((c) => (c.status || '').toUpperCase() === 'ACTIVE');
    if (activeLive) {
      // Clean up any stale/legacy duplicate Connection docs for this entityId + toolkit that don't match activeLive.id
      await Connection.deleteMany({
        $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
        appProviderKey: keyLower,
        composioConnectionId: { $ne: activeLive.id },
      });

      // Upsert directly by unique composioConnectionId to avoid duplicate key index collisions
      const synced = await Connection.findOneAndUpdate(
        { composioConnectionId: activeLive.id },
        {
          $set: {
            workspaceId: entityId,
            composioEntityId: entityId,
            composioConnectionId: activeLive.id,
            appProviderKey: keyLower,
            accountLabel: `${appProvider?.displayName || keyLower} Account`,
            status: 'ACTIVE',
            connectedBy: entityId,
            lastSyncedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`[COMPOSIO_CHECK_BEFORE_CREATE] entity_id=${entityId} toolkit=${keyLower} -> found live ACTIVE connection, synced locally, skipping new link.`);
      return { connection: synced, redirectUrl: null, alreadyConnected: true };
    }

    // --- Step 3: No active connection anywhere: Safe to mint a new auth link ---
    let authConfigId = appProvider?.composioAuthConfigId;

    if (!authConfigId) {
      authConfigId = await this.resolveAuthConfigId(keyLower);
      if (appProvider) {
        appProvider.composioAuthConfigId = authConfigId;
        await appProvider.save();
      }
    }

    const callbackUrl = `${env.CLIENT_URL}/settings/integrations/callback`;

    const response = await this.composioRequest('/connected_accounts/link', 'POST', {
      auth_config_id: authConfigId,
      user_id: entityId,
      redirect_url: callbackUrl,
    });

    const composioConnectionId = response.connected_account_id || response.connectedAccountId || `ca_${Date.now()}`;
    const redirectUrl = response.redirect_url || response.redirectUrl || `${env.CLIENT_URL}/settings/integrations`;

    // Clean up any stale duplicate docs before upserting initiated connection
    await Connection.deleteMany({
      $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
      appProviderKey: keyLower,
      composioConnectionId: { $ne: composioConnectionId },
    });

    const connection = await Connection.findOneAndUpdate(
      { composioConnectionId },
      {
        $set: {
          workspaceId: entityId,
          composioEntityId: entityId,
          composioConnectionId,
          appProviderKey: keyLower,
          accountLabel: `${appProvider?.displayName || keyLower} Account`,
          status: 'INITIATED',
          connectedBy: entityId,
          lastSyncedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    return {
      connection,
      redirectUrl,
      alreadyConnected: false,
    };
  }

  /**
   * Revoke & disconnect connection for user and toolkit slug
   */
  static async disconnectConnection(userId, appKey) {
    if (!userId || !appKey) throw ApiError.badRequest('userId and appKey are required');
    const entityId = userId.toString();
    const keyLower = appKey.toLowerCase();

    // Delete local Connection documents for this entityId + toolkit
    await Connection.deleteMany({
      $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
      appProviderKey: keyLower,
    });

    // Attempt to revoke live Composio v3 connected account if present
    try {
      const liveRes = await this.composioRequest(`/connected_accounts?user_id=${entityId}`);
      const liveItems = liveRes.items || liveRes.data || [];
      const match = liveItems.find(
        (c) => (c.toolkit?.slug || c.appName || '').toLowerCase() === keyLower
      );
      if (match?.id) {
        await this.composioRequest(`/connected_accounts/${match.id}`, 'DELETE').catch(() => {});
      }
    } catch (err) {
      console.warn(`⚠️ Could not revoke live Composio connection for ${keyLower}:`, err.message);
    }

    return { success: true, message: `Successfully disconnected ${appKey}` };
  }

  /**
   * Sync all connected accounts for a given user from Composio v3 API
   */
  static async syncUserConnections(userId) {
    if (!userId) return [];

    const entityId = userId.toString();
    try {
      const res = await this.composioRequest(`/connected_accounts?user_id=${entityId}`);
      const items = res.items || res.data || [];

      for (const item of items) {
        const appKey = (item.toolkit?.slug || item.appName || '').toLowerCase();
        if (!appKey) continue;

        const status = (item.status || 'INITIATED').toUpperCase();

        // Clean up any leftover duplicate docs with different composioConnectionIds for this appKey to prevent E11000
        await Connection.deleteMany({
          $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
          appProviderKey: appKey,
          composioConnectionId: { $ne: item.id },
        });

        await Connection.findOneAndUpdate(
          { composioConnectionId: item.id },
          {
            $set: {
              workspaceId: entityId,
              composioEntityId: entityId,
              composioConnectionId: item.id,
              appProviderKey: appKey,
              accountLabel: `${appKey.charAt(0).toUpperCase() + appKey.slice(1)} Account`,
              status,
              lastSyncedAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      }
    } catch (err) {
      console.warn('⚠️ Could not sync live user connections from Composio API:', err.message);
    }

    return Connection.find({ $or: [{ composioEntityId: entityId }, { workspaceId: entityId }] }).sort({ createdAt: -1 });
  }

  /**
   * Fetch live connection status from Composio v3 API
   */
  static async refreshConnectionStatus(userId, composioConnectionId) {
    const entityId = userId.toString();
    const connection = await Connection.findOne({
      $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
      composioConnectionId,
    });
    if (!connection) throw ApiError.notFound('Connection reference not found');

    let composioData;
    try {
      composioData = await this.composioRequest(`/connected_accounts/${composioConnectionId}`);
    } catch (err) {
      connection.status = 'FAILED';
      connection.lastErrorAt = new Date();
      await connection.save();
      return connection;
    }

    const liveStatus = (composioData.status || composioData.connection_status || 'ACTIVE').toUpperCase();
    connection.status = liveStatus;
    connection.lastSyncedAt = new Date();
    await connection.save();

    return connection;
  }

  /**
   * Execute Tool Call via Composio v3 API & Record Usage
   */
  static async executeToolCall({ workspaceId, connectionId, actionKey, parameters = {} }) {
    const entityId = workspaceId.toString();
    const connection = await Connection.findOne({
      $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
      _id: connectionId,
    });
    if (!connection) throw ApiError.notFound('Workspace connection not found');

    const startTime = Date.now();
    let result;
    let status = 'success';
    let errorMessage = null;

    try {
      // Composio v3 POST /api/v3/tools/execute/{tool_slug} with user_id and connected_account_id
      const toolSlug = encodeURIComponent(actionKey);
      result = await this.composioRequest(`/tools/execute/${toolSlug}`, 'POST', {
        user_id: entityId,
        connected_account_id: connection.composioConnectionId,
        arguments: parameters,
        version: 'latest',
      });
    } catch (err) {
      status = 'error';
      errorMessage = err.message;
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      const periodKey = new Date().toISOString().slice(0, 7);

      await ToolCallLog.create({
        workspaceId: entityId,
        providerId: connection.appProviderKey,
        actionKey,
        status,
        durationMs,
        errorMessage,
      });

      await UsageCounter.updateOne(
        { workspaceId: entityId, periodKey },
        { $inc: { toolCallsCount: 1 } },
        { upsert: true }
      );
    }

    return result;
  }

  /**
   * Mock response for local development when COMPOSIO_API_KEY is not configured
   */
  static getMockResponse(endpoint, method, body) {
    if (endpoint === '/toolkits' || endpoint === '/tools' || endpoint === '/apps') {
      return { items: this.getDefaultFallbackTools() };
    }
    if (endpoint === '/auth_configs') {
      return { items: [{ id: 'ac_mock_123', name: 'Mock Auth Config' }] };
    }
    if (endpoint === '/connected_accounts/link' || endpoint === '/connectedAccounts') {
      return {
        connected_account_id: `ca_mock_${Date.now()}`,
        redirect_url: `${env.CLIENT_URL}/settings/integrations?status=success`,
      };
    }
    if (endpoint.startsWith('/connected_accounts/')) {
      return { status: 'ACTIVE' };
    }
    if (endpoint.startsWith('/tools/execute') || endpoint.startsWith('/actions/')) {
      return { successful: true, data: { message: 'Mock Composio v3 tool execution succeeded' } };
    }
    return {};
  }

  static getDefaultFallbackTools() {
    return [
      { slug: 'gmail', name: 'Gmail', category: 'Communication', toolkit: { slug: 'gmail', name: 'Gmail', logo: 'https://cdn.svgporn.com/logos/gmail.svg' } },
      { slug: 'googlecalendar', name: 'Google Calendar', category: 'Productivity', toolkit: { slug: 'googlecalendar', name: 'Google Calendar', logo: 'https://cdn.svgporn.com/logos/google-calendar.svg' } },
      { slug: 'googlemeet', name: 'Google Meet', category: 'Communication', toolkit: { slug: 'googlemeet', name: 'Google Meet', logo: 'https://cdn.svgporn.com/logos/google-meet.svg' } },
      { slug: 'linkedin', name: 'LinkedIn', category: 'Social Media', toolkit: { slug: 'linkedin', name: 'LinkedIn', logo: 'https://cdn.svgporn.com/logos/linkedin-icon.svg' } },
      { slug: 'instagram', name: 'Instagram', category: 'Social Media', toolkit: { slug: 'instagram', name: 'Instagram', logo: 'https://cdn.svgporn.com/logos/instagram-icon.svg' } },
      { slug: 'facebook', name: 'Facebook', category: 'Social Media', toolkit: { slug: 'facebook', name: 'Facebook', logo: 'https://cdn.svgporn.com/logos/facebook.svg' } },
      { slug: 'slack', name: 'Slack', category: 'Communication', toolkit: { slug: 'slack', name: 'Slack', logo: 'https://cdn.svgporn.com/logos/slack-icon.svg' } },
      { slug: 'notion', name: 'Notion', category: 'Productivity', toolkit: { slug: 'notion', name: 'Notion', logo: 'https://cdn.svgporn.com/logos/notion-icon.svg' } },
      { slug: 'googlesheets', name: 'Google Sheets', category: 'Productivity', toolkit: { slug: 'googlesheets', name: 'Google Sheets', logo: 'https://cdn.svgporn.com/logos/google-sheets.svg' } },
      { slug: 'discord', name: 'Discord', category: 'Communication', toolkit: { slug: 'discord', name: 'Discord', logo: 'https://cdn.svgporn.com/logos/discord-icon.svg' } },
      { slug: 'trello', name: 'Trello', category: 'Project Management', toolkit: { slug: 'trello', name: 'Trello', logo: 'https://cdn.svgporn.com/logos/trello.svg' } },
    ];
  }
}

module.exports = ComposioService;