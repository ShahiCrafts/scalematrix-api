const express = require('express');
const router = express.Router();
const SocialEngineController = require('../controllers/SocialEngineController');
const { authenticateJWT } = require('../middleware/authMiddleware');

// ── Public Webhook Verification & Listener Endpoints (No JWT required) ──
router.get('/webhooks/meta', SocialEngineController.verifyWebhook);
router.post('/webhooks/meta', SocialEngineController.handleWebhookEvent);

// ── OAuth Callbacks (Public) ──
router.get('/oauth/:provider/callback', SocialEngineController.handleOAuthCallback);

// ── Protected Social Integration Endpoints (JWT Authenticated) ──
router.use(authenticateJWT);

// OAuth Initiation
router.get('/oauth/url', SocialEngineController.getAuthorizationUrl);

// Account Connections
router.get('/accounts', SocialEngineController.getConnectedAccounts);
router.delete('/accounts/:accountId', SocialEngineController.disconnectAccount);

// Content Publishing & Scheduling
router.post('/publish', SocialEngineController.publishContent);
router.get('/posts', SocialEngineController.getPosts);

// Analytics & Insights
router.get('/analytics/:accountId', SocialEngineController.getAnalytics);
router.post('/analytics/:accountId/sync', SocialEngineController.syncAnalytics);

// Unified Social Inbox
router.get('/inbox/:accountId', SocialEngineController.getInbox);
router.post('/inbox/items/:itemId/reply', SocialEngineController.replyToInboxItem);

module.exports = router;
