const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const asyncHandler = require('./utils/asyncHandler');
const ApiError = require('./utils/ApiError');
const ApiResponse = require('./utils/ApiResponse');
const Logger = require('./utils/logger');
const env = require('./config/env');

// Import main router
const apiRouter = require('./routes');

const app = express();

// HTTP Request Logger with Morgan
const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'combined';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => Logger.http(message),
  },
}));

// Set security HTTP headers
app.use(helmet());

// Enable CORS - restrict to client URL
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
}));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Parse cookies (required for refresh token storage)
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use((req, res, next) => {
  if (req.body) {
    mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  }
  if (req.params) {
    mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  }
  next();
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json(new ApiResponse(200, { status: 'ok' }, 'Server is healthy'));
});

// Mount central API v1 routes (/api/v1/auth, /api/v1/onboarding, /api/v1/health, /api/v1/chat)
app.use('/api/v1', apiRouter);

// Mount direct /api/chat endpoint
app.use('/api/chat', require('./routes/chatRoutes'));

// 404 handler for undefined routes
app.use((req, res, next) => {
  next(ApiError.notFound(`Can't find ${req.originalUrl} on this server`));
});

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  let userFriendlyMessage = err.message || 'An unexpected error occurred. Please try again.';

  if (statusCode >= 500) {
    Logger.error(`Unhandled Server Error [${req.method} ${req.originalUrl}]: ${err.message}`, err);
    // Sanitize technical stack trace errors for client response
    if (!err.isOperational) {
      userFriendlyMessage = 'An internal server error occurred. Please try again shortly.';
    }
  } else {
    Logger.warn(`API Error [${statusCode}] ${req.method} ${req.originalUrl}: ${userFriendlyMessage}`);
  }

  res.status(statusCode).json({
    success: false,
    message: userFriendlyMessage,
    data: err.data || null,
  });
});

module.exports = app;
