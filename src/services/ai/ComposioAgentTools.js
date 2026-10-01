const ComposioService = require('../ComposioService');
const Connection = require('../../models/Connection');
const ApiError = require('../../utils/ApiError');

// 10-App Allowlist strictly enforced by ScaleMatrix
const ALLOWED_TOOLKITS = [
  'gmail',
  'googlecalendar',
  'googlemeet',
  'linkedin',
  'instagram',
  'facebook',
  'notion',
  'googlesheets',
  'sheets',
  'discord',
  'trello',
];

class ComposioAgentTools {
  static get ALLOWED_TOOLKITS() {
    return ALLOWED_TOOLKITS;
  }

  /**
   * Normalizes action keys into canonical Composio SCREAMING_SNAKE_CASE format.
   * e.g. "googlecalendar.createEvent" -> "GOOGLECALENDAR_CREATE_EVENT"
   *      "googlecalendar.addEvent" -> "GOOGLECALENDAR_CREATE_EVENT"
   */
  static normalizeActionKey(actionKey = '') {
    if (!actionKey) return '';
    const trimmed = actionKey.trim();

    const ALIAS_MAP = {
      'googlecalendar.createevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'googlecalendar.addevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'googlecalendar_createevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'googlecalendar_addevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'googlecalendar.quickadd': 'GOOGLECALENDAR_QUICK_ADD',
      'createevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'addevent': 'GOOGLECALENDAR_CREATE_EVENT',
      'create_event': 'GOOGLECALENDAR_CREATE_EVENT',
      'add_event': 'GOOGLECALENDAR_CREATE_EVENT',
      'quickadd': 'GOOGLECALENDAR_QUICK_ADD',
      'quick_add': 'GOOGLECALENDAR_QUICK_ADD',
      'gmail.sendemail': 'GMAIL_SEND_EMAIL',
      'gmail_sendemail': 'GMAIL_SEND_EMAIL',
      'sendemail': 'GMAIL_SEND_EMAIL',
      'send_email': 'GMAIL_SEND_EMAIL',
      'sendmail': 'GMAIL_SEND_EMAIL',
      'notion.createpage': 'NOTION_CREATE_PAGE',
      'notion_createpage': 'NOTION_CREATE_PAGE',
      'createpage': 'NOTION_CREATE_PAGE',
      'create_page': 'NOTION_CREATE_PAGE',
    };

    const cleanLower = trimmed.toLowerCase().replace(/\s+/g, '');
    if (ALIAS_MAP[cleanLower]) {
      return ALIAS_MAP[cleanLower];
    }

    let formatted = trimmed
      .replace(/\./g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();

    return formatted;
  }

  /**
   * Safely resolve toolkit slug from actionKey without raw string splitting assumption
   */
  static resolveToolkitFromActionKey(actionKey = '') {
    if (!actionKey) return '';
    const keyLower = actionKey.toLowerCase();
    for (const toolkit of ALLOWED_TOOLKITS) {
      if (keyLower.startsWith(`${toolkit}.`) || keyLower.startsWith(`${toolkit}_`) || keyLower.includes(toolkit)) {
        return toolkit === 'sheets' ? 'googlesheets' : toolkit;
      }
    }

    // Keyword fallback checks if no direct toolkit slug match found
    if (keyLower.includes('event') || keyLower.includes('calendar') || keyLower.includes('quickadd') || keyLower.includes('schedule')) {
      return 'googlecalendar';
    }
    if (keyLower.includes('email') || keyLower.includes('mail') || keyLower.includes('gmail') || keyLower.includes('inbox') || keyLower.includes('draft')) {
      return 'gmail';
    }
    if (keyLower.includes('page') || keyLower.includes('notion') || keyLower.includes('database')) {
      return 'notion';
    }
    if (keyLower.includes('sheet') || keyLower.includes('spreadsheet') || keyLower.includes('row')) {
      return 'googlesheets';
    }
    if (keyLower.includes('meet') || keyLower.includes('conference')) {
      return 'googlemeet';
    }

    const firstPart = actionKey.split('.')[0] || actionKey.split('_')[0];
    return (firstPart || '').toLowerCase();
  }

  /**
   * Return array of meta-tool schemas exposed to the AI model
   */
  static getToolDefinitions() {
    return [
      {
        name: 'COMPOSIO_SEARCH_TOOLS',
        description: 'Search for available tools strictly within ScaleMatrix authorized 10 apps (Gmail, Google Calendar, Google Meet, LinkedIn, Instagram, Facebook, Notion, Google Sheets, Discord, Trello). Always use the exact returned toolkit names.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or functionality description' },
            toolkits: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional filter by exact toolkit name (e.g. googlecalendar, gmail)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'COMPOSIO_MANAGE_CONNECTIONS',
        description: 'Initiate authentication / connection setup for an app if it is not currently connected. STOP after generating connection link.',
        inputSchema: {
          type: 'object',
          properties: {
            toolkits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['add', 'remove', 'status'] },
                  name: { type: 'string', description: 'App toolkit slug (e.g., googlecalendar, gmail)' },
                },
                required: ['action', 'name'],
              },
            },
          },
          required: ['toolkits'],
        },
      },
      {
        name: 'COMPOSIO_GET_TOOL_SCHEMAS',
        description: 'Retrieve input schema and parameter details for specific action keys.',
        inputSchema: {
          type: 'object',
          properties: {
            actions: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of action keys to inspect',
            },
          },
          required: ['actions'],
        },
      },
      {
        name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
        description: 'Execute one or more authorized tool actions.',
        inputSchema: {
          type: 'object',
          properties: {
            executions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  actionKey: { type: 'string', description: 'Target action key to execute' },
                  parameters: { type: 'object', description: 'Execution parameters' },
                },
                required: ['actionKey'],
              },
            },
          },
          required: ['executions'],
        },
      },
    ];
  }

  /**
   * Execute a meta-tool invoked by the AI agent
   */
  static async executeMetaTool(toolName, args = {}, context = {}) {
    const rawUserId = context.userId || context.workspaceId;
    if (!rawUserId) {
      throw ApiError.unauthorized('User entity_id context is required for tool execution.');
    }
    const entityId = rawUserId.toString();

    if (process.env.DEBUG_STREAMING === 'true') {
      console.log(`[COMPOSIO_ENTITY_ID] tool=${toolName} entityId=${entityId}`);
    }

    switch (toolName) {
      case 'COMPOSIO_SEARCH_TOOLS': {
        const query = (args.query || '').toLowerCase();
        const requestedToolkits = args.toolkits ? args.toolkits.map((t) => t.toLowerCase()) : null;

        // Fetch catalog from ComposioService / AppProvider
        const catalog = await ComposioService.fetchAndSyncCatalog();

        // Strictly filter to the 10-app allowlist ONLY
        const filtered = catalog.filter((app) => {
          const key = (app.composioAppKey || '').toLowerCase();
          const isAllowed = ALLOWED_TOOLKITS.includes(key);
          if (!isAllowed) return false;

          if (requestedToolkits && requestedToolkits.length > 0) {
            return requestedToolkits.some((tk) => key.includes(tk) || tk.includes(key));
          }

          if (query) {
            return (
              key.includes(query) ||
              (app.displayName || '').toLowerCase().includes(query) ||
              (app.category || '').toLowerCase().includes(query)
            );
          }

          return true;
        });

        // Map search results with connection status using standardized entityId
        const activeConnections = await Connection.find({
          $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
          status: 'ACTIVE',
        });
        const activeKeys = new Set(activeConnections.map((c) => c.appProviderKey.toLowerCase()));

        const results = filtered.map((app) => ({
          toolkit: app.composioAppKey,
          name: app.displayName,
          category: app.category,
          isConnected: activeKeys.has(app.composioAppKey.toLowerCase()) || app.isNoAuth,
          isNoAuth: app.isNoAuth,
        }));

        return {
          success: true,
          count: results.length,
          tools: results,
          allowlistEnforced: true,
        };
      }

      case 'COMPOSIO_MANAGE_CONNECTIONS': {
        const toolkitsToManage = args.toolkits || [];
        const results = [];

        for (const item of toolkitsToManage) {
          const name = (item.name || '').toLowerCase();
          
          if (!ALLOWED_TOOLKITS.includes(name)) {
            results.push({
              toolkit: name,
              status: 'rejected',
              message: `Toolkit '${name}' is not in ScaleMatrix authorized 10-app allowlist.`,
            });
            continue;
          }

          if (item.action === 'add') {
            // Bug 1 fix: enforce check-before-create in code (not LLM judgment).
            // Look for an existing ACTIVE connection for this exact
            // entity_id + toolkit slug pair before ever asking
            // ComposioService to mint a new auth link. This is a second,
            // redundant guard on top of the one inside
            // ComposioService.initiateConnection itself, so the agent path
            // is safe even if that guard is ever bypassed or refactored.
            const existingActive = await Connection.findOne({
              $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
              appProviderKey: name,
              status: 'ACTIVE',
            });

            console.log(
              `[COMPOSIO_MANAGE_CONNECTIONS_ADD] entity_id=${entityId} toolkit=${name} ` +
              `existingActiveConnection=${existingActive ? existingActive.composioConnectionId : 'none'}`
            );

            if (existingActive) {
              results.push({
                toolkit: name,
                status: 'already_connected',
                connectionId: existingActive._id,
                message: `${name} is already connected. Proceeding with the request — no new authorization needed.`,
              });
              continue;
            }

            const connResult = await ComposioService.initiateConnection(entityId, name);

            if (connResult.alreadyConnected) {
              results.push({
                toolkit: name,
                status: 'already_connected',
                connectionId: connResult.connection?._id,
                message: `${name} is already connected. Proceeding with the request — no new authorization needed.`,
              });
            } else {
              results.push({
                toolkit: name,
                status: 'connection_initiated',
                redirectUrl: connResult.redirectUrl,
                connectionId: connResult.connection?._id,
                message: `Please complete authorization for ${name} at the following link: ${connResult.redirectUrl}`,
              });
            }
          } else if (item.action === 'remove' || item.action === 'disconnect') {
            await ComposioService.disconnectConnection(entityId, name);
            results.push({
              toolkit: name,
              status: 'disconnected',
              message: `Successfully disconnected ${name} account.`,
            });
          } else if (item.action === 'status') {
            const conn = await Connection.findOne({
              $or: [{ composioEntityId: entityId }, { workspaceId: entityId }],
              appProviderKey: name,
            });
            results.push({
              toolkit: name,
              status: conn ? conn.status : 'NOT_CONNECTED',
              lastSyncedAt: conn ? conn.lastSyncedAt : null,
            });
          }
        }

        const requiresUserAuth = results.some((r) => r.status === 'connection_initiated' || Boolean(r.redirectUrl));
        return {
          success: true,
          results,
          requiresUserAuth,
        };
      }

      case 'COMPOSIO_GET_TOOL_SCHEMAS': {
        const actions = args.actions || [];
        const schemas = actions.map((act) => {
          const normKey = ComposioAgentTools.normalizeActionKey(act);
          return {
            actionKey: normKey,
            parameters: {
              type: 'object',
              properties: {
                calendar_id: { type: 'string', description: 'Calendar ID (default "primary")', default: 'primary' },
                summary: { type: 'string', description: 'Event title / summary (e.g. Dance Event)' },
                description: { type: 'string', description: 'Detailed event description' },
                start: { type: 'string', description: 'Start date-time in ISO 8601 format (e.g. 2026-09-17T09:00:00+05:45)' },
                end: { type: 'string', description: 'End date-time in ISO 8601 format (e.g. 2026-09-17T10:00:00+05:45)' },
                start_datetime: { type: 'string', description: 'Start ISO timestamp' },
                end_datetime: { type: 'string', description: 'End ISO timestamp' },
                startTime: { type: 'string', description: 'Start ISO timestamp' },
                endTime: { type: 'string', description: 'End ISO timestamp' },
              },
            },
          };
        });

        return {
          success: true,
          schemas,
        };
      }

      case 'COMPOSIO_MULTI_EXECUTE_TOOL': {
        const executions = args.executions || [];
        const executionResults = [];

        for (const exec of executions) {
          const rawActionKey = exec.actionKey || '';
          const normalizedActionKey = ComposioAgentTools.normalizeActionKey(rawActionKey);
          const resolvedToolkit =
            ComposioAgentTools.resolveToolkitFromActionKey(normalizedActionKey) ||
            ComposioAgentTools.resolveToolkitFromActionKey(rawActionKey);

          if (process.env.DEBUG_STREAMING === 'true') {
            console.log(`[ACTION_KEY_RESOLVE] rawActionKey=${rawActionKey} normalizedActionKey=${normalizedActionKey} resolvedToolkit=${resolvedToolkit} entityId=${entityId}`);
          }

          const connection = await Connection.findOne({
            $or: [{ composioEntityId: entityId }, { workspaceId: entityId }, { connectedBy: entityId }],
            appProviderKey: resolvedToolkit,
            status: 'ACTIVE',
          });

          if (!connection) {
            executionResults.push({
              actionKey: normalizedActionKey,
              success: false,
              error: `No active connection found for ${resolvedToolkit}. Use COMPOSIO_MANAGE_CONNECTIONS first to connect your account.`,
            });
            continue;
          }

          try {
            const res = await ComposioService.executeToolCall({
              workspaceId: entityId,
              connectionId: connection._id,
              actionKey: normalizedActionKey,
              parameters: exec.parameters || {},
            });
            executionResults.push({ actionKey: normalizedActionKey, success: true, data: res });
          } catch (err) {
            executionResults.push({ actionKey: normalizedActionKey, success: false, error: err.message });
          }
        }

        return {
          success: true,
          results: executionResults,
        };
      }

      default:
        throw ApiError.badRequest(`Unknown meta tool: ${toolName}`);
    }
  }
}

module.exports = ComposioAgentTools;