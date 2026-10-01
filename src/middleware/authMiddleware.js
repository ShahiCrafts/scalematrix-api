const TokenService = require('../services/TokenService');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Express middleware to protect routes with JWT Access Tokens
 */
const authenticateJWT = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw ApiError.unauthorized('Access denied. No authorization token provided.');
  }

  try {
    const decoded = TokenService.verifyAccessToken(token);
    const user = await User.findById(decoded.sub);

    if (!user) {
      throw ApiError.unauthorized('Invalid access token. User account no longer exists.');
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      throw ApiError.unauthorized('Session revoked. Please log in again.');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.statusCode === 401) {
      throw error;
    }
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired. Please refresh your session.');
    }
    throw ApiError.unauthorized('Invalid access token');
  }
});

module.exports = {
  authenticateJWT,
};
