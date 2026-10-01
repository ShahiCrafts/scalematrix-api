const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticateJWT } = require('../middleware/authMiddleware');
const { authRateLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  verifyOTPSchema,
  resendOTPSchema,
  googleAuthSchema,
  githubAuthSchema,
} = require('../utils/validators');

// Public Auth Endpoints (Rate limited for security)
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/verify-otp', authRateLimiter, validate(verifyOTPSchema), authController.verifyOTP);
router.post('/resend-otp', authRateLimiter, validate(resendOTPSchema), authController.resendOTP);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/google', authRateLimiter, validate(googleAuthSchema), authController.googleAuth);
router.post('/github', authRateLimiter, validate(githubAuthSchema), authController.githubAuth);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// Protected Auth Endpoint
router.get('/me', authenticateJWT, authController.getMe);

module.exports = router;
