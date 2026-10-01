const express = require('express');
const router = express.Router();
const { handleChatStream, generateThreadTitle } = require('../controllers/chatController');
const { authenticateJWT } = require('../middleware/authMiddleware');

// All chat endpoints are protected with custom ScaleMatrix MongoDB JWT authentication
router.use(authenticateJWT);

// Streaming SSE Chat Endpoint
router.post('/', handleChatStream);

// Separate Lightweight Thread Title Auto-Generator Endpoint
router.post('/title', generateThreadTitle);

module.exports = router;
