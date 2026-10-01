const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateJWT } = require('../middleware/authMiddleware');

router.use(authenticateJWT);

router.get('/layout', dashboardController.getLayout);
router.get('/metrics', dashboardController.getMetrics);
router.put('/widget-bindings/:bindingId', dashboardController.updateWidgetBinding);

module.exports = router;
