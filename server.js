const app = require('./src/app');
const connectDB = require('./src/config/db');
const env = require('./src/config/env');
const SchedulerService = require('./src/services/SchedulerService');

const PORT = env.PORT || 5001;

// Connect to MongoDB Database
connectDB().then(() => {
  // Initialize Social Integration Engine Background Worker & Scheduler
  SchedulerService.startScheduler();
});

// Start Express HTTP Server
const server = app.listen(PORT, () => {
  console.log(`
  🚀 ===================================================
  ⚡ ScaleMatrix Hardened Backend API Server Online
  📡 Environment: ${env.NODE_ENV}
  🔗 Listening on: http://localhost:${PORT}
  🏥 Health Check: http://localhost:${PORT}/api/v1/health
  ===================================================
  `);
});

// Graceful Shutdown Handler
const handleGracefulShutdown = (signal) => {
  console.log(`\n⚠️ Received ${signal}. Gracefully shutting down HTTP server...`);
  server.close(() => {
    console.log('🔒 HTTP server closed cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message);
});
