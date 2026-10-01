const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateJWT } = require('../middleware/authMiddleware');

router.use(authenticateJWT);
router.get('/me', subscriptionController.getSubscription);

module.exports = router;
