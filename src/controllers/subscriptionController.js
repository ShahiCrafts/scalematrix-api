const SubscriptionService = require('../services/SubscriptionService');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSubscription = asyncHandler(async (req, res) => {
  const workspaceId = req.user.activeOrganization;
  if (!workspaceId) {
    return res.status(200).json(new ApiResponse(200, null, 'No active workspace selected'));
  }
  const result = await SubscriptionService.getWorkspaceSubscription(workspaceId);
  res.status(200).json(new ApiResponse(200, result, 'Subscription and usage data fetched successfully'));
});

module.exports = {
  getSubscription,
};
