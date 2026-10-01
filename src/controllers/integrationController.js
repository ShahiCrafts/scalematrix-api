const ComposioService = require('../services/ComposioService');
const Connection = require('../models/Connection');
const AppProvider = require('../models/AppProvider');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const ALLOWED_INTEGRATIONS = [
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

const getCatalog = asyncHandler(async (req, res) => {
  let providers = await ComposioService.fetchAndSyncCatalog();
  const filtered = providers.filter((p) => ALLOWED_INTEGRATIONS.includes((p.composioAppKey || '').toLowerCase()));
  res.status(200).json(new ApiResponse(200, filtered, 'App catalog fetched successfully'));
});

const getShortlist = asyncHandler(async (req, res) => {
  let providers = await AppProvider.find({ composioAppKey: { $in: ALLOWED_INTEGRATIONS } });

  if (providers.length === 0) {
    await ComposioService.fetchAndSyncCatalog();
    providers = await AppProvider.find({ composioAppKey: { $in: ALLOWED_INTEGRATIONS } });
  }

  res.status(200).json(new ApiResponse(200, providers, 'Popular apps shortlist fetched successfully'));
});

const getConnections = asyncHandler(async (req, res) => {
  // Standardize entity_id on authenticated user's MongoDB _id string
  const userId = req.user._id.toString();
  const connections = await ComposioService.syncUserConnections(userId);
  res.status(200).json(new ApiResponse(200, connections, 'User connections fetched successfully'));
});

const connectApp = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { appKey } = req.body;
  const result = await ComposioService.initiateConnection(userId, appKey);
  res.status(200).json(new ApiResponse(200, result, 'Connection initiated successfully'));
});

const refreshStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { composioConnectionId } = req.body;
  const connection = await ComposioService.refreshConnectionStatus(userId, composioConnectionId);
  res.status(200).json(new ApiResponse(200, connection, 'Connection status refreshed'));
});

const disconnectApp = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { appKey } = req.body;
  const result = await ComposioService.disconnectConnection(userId, appKey);
  res.status(200).json(new ApiResponse(200, result, 'Connection disconnected successfully'));
});

module.exports = {
  getCatalog,
  getShortlist,
  getConnections,
  connectApp,
  disconnectApp,
  refreshStatus,
};
