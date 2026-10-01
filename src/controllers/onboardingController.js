const OnboardingService = require('../services/OnboardingService');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const setupWorkspace = asyncHandler(async (req, res) => {
  const result = await OnboardingService.createWorkspaceWithTrial(req.user._id, req.body, req);
  res.status(201).json(new ApiResponse(201, result, result.message));
});

const sendInvites = asyncHandler(async (req, res) => {
  const result = await OnboardingService.sendOnboardingInvites(req.user._id, req.body);
  res.status(200).json(new ApiResponse(200, result, result.message));
});

const getStatus = asyncHandler(async (req, res) => {
  const result = await OnboardingService.getOnboardingStatus(req.user._id);
  res.status(200).json(new ApiResponse(200, result, 'Onboarding status fetched successfully'));
});

module.exports = {
  setupWorkspace,
  sendInvites,
  getStatus,
};
