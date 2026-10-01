const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const onboardingRoutes = require('./onboardingRoutes');
const socialRoutes = require('./socialRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const integrationRoutes = require('./integrationRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const mongoose = require('mongoose');

const chatRoutes = require('./chatRoutes');

// Health Check Endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    system: 'ScaleMatrix API OS',
    timestamp: new Date().toISOString(),
    databaseState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// API v1 Modules
router.use('/auth', authRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/social', socialRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/integrations', integrationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/chat', chatRoutes);

module.exports = router;
