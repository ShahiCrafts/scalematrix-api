const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const { authenticateJWT } = require('../middleware/authMiddleware');

// All onboarding endpoints require JWT authentication
router.use(authenticateJWT);

router.post('/setup', onboardingController.setupWorkspace);
router.post('/invites', onboardingController.sendInvites);
router.get('/status', onboardingController.getStatus);

module.exports = router;
