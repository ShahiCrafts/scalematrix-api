const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');
const { authenticateJWT } = require('../middleware/authMiddleware');

router.use(authenticateJWT);

router.get('/catalog', integrationController.getCatalog);
router.get('/shortlist', integrationController.getShortlist);
router.get('/connections', integrationController.getConnections);
router.post('/connect', integrationController.connectApp);
router.post('/disconnect', integrationController.disconnectApp);
router.post('/refresh-status', integrationController.refreshStatus);

module.exports = router;
