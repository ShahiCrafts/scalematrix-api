const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');

/**
 * Strict Rate Limiter for Authentication and OTP endpoints
 * Max 5 requests per 15 minutes per IP
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many auth/OTP requests from this IP. Please try again after 15 minutes.'));
  },
});

/**
 * Global API Rate Limiter
 * Max 100 requests per 15 minutes per IP
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many requests to ScaleMatrix API. Please try again later.'));
  },
});

module.exports = {
  authRateLimiter,
  globalRateLimiter,
};
