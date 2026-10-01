const AuthService = require('../services/AuthService');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const result = await AuthService.registerUser(req.body);
  res.status(201).json(new ApiResponse(201, result.user, result.message));
});

const verifyOTP = asyncHandler(async (req, res) => {
  const result = await AuthService.verifyOTP(req.body, req, res);
  res.status(200).json(new ApiResponse(200, result, 'Email verified and logged in successfully'));
});

const resendOTP = asyncHandler(async (req, res) => {
  const result = await AuthService.resendOTP(req.body);
  res.status(200).json(new ApiResponse(200, null, result.message));
});

const login = asyncHandler(async (req, res) => {
  const result = await AuthService.loginUser(req.body, req, res);
  res.status(200).json(new ApiResponse(200, result, 'Logged in successfully'));
});

const googleAuth = asyncHandler(async (req, res) => {
  const result = await AuthService.googleAuth(req.body, req, res);
  res.status(200).json(new ApiResponse(200, result, 'Google authentication successful'));
});

const githubAuth = asyncHandler(async (req, res) => {
  const result = await AuthService.githubAuth(req.body, req, res);
  res.status(200).json(new ApiResponse(200, result, 'GitHub authentication successful'));
});

const refreshToken = asyncHandler(async (req, res) => {
  const result = await AuthService.refreshTokens(req, res);
  res.status(200).json(new ApiResponse(200, result, 'Access token refreshed successfully'));
});

const logout = asyncHandler(async (req, res) => {
  const result = await AuthService.logout(req, res);
  res.status(200).json(new ApiResponse(200, null, result.message));
});

const Workspace = require('../models/Workspace');
const Membership = require('../models/Membership');

const getMe = asyncHandler(async (req, res) => {
  let hasCompletedWorkspaceSetup = false;
  let workspace = null;

  if (req.user.activeOrganization) {
    workspace = await Workspace.findById(req.user.activeOrganization);
    if (workspace && workspace.setupCompletedAt) {
      const membership = await Membership.findOne({
        workspaceId: workspace._id,
        userId: req.user._id,
        status: 'active',
      });
      if (membership) {
        hasCompletedWorkspaceSetup = true;
      }
    }
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: req.user._id,
          email: req.user.email,
          fullName: req.user.fullName,
          avatar: req.user.avatar,
          isEmailVerified: req.user.isEmailVerified,
          role: req.user.role,
          activeOrganization: req.user.activeOrganization,
          hasCompletedWorkspaceSetup,
          workspaceName: workspace?.name || '',
        },
      },
      'User profile fetched successfully'
    )
  );
});

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  googleAuth,
  githubAuth,
  refreshToken,
  logout,
  getMe,
};
