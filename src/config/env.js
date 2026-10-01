const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().default('5001').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/scalematrix'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters long'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_CLIENT_ID: z.string().optional().default(''),
  GITHUB_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_REDIRECT_URI: z.string().optional().default('http://localhost:5173/auth/callback/github'),
  RESEND_API_KEY: z.string().optional().default(''),
  SENDER_EMAIL: z.string().email().default('onboarding@resend.dev'),
  SENDER_NAME: z.string().default('ScaleMatrix'),

  // Composio Integration Platform Credentials
  COMPOSIO_API_KEY: z.string().optional().default(''),
  COMPOSIO_BASE_URL: z.string().default('https://backend.composio.dev/api/v3'),

  // Social Engine Credentials & Token Security
  TOKEN_ENCRYPTION_KEY: z.string().default('scalematrix_secure_token_encryption_key_32_bytes_min!'),
  META_APP_ID: z.string().optional().default(''),
  META_APP_SECRET: z.string().optional().default(''),
  META_CONFIG_ID: z.string().optional().default(''),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().default('scalematrix_meta_webhook_secret_v1'),
  META_API_VERSION: z.string().default('v19.0'),
  META_OAUTH_REDIRECT_URI: z.string().default('http://localhost:5001/api/v1/social/oauth/meta/callback'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid Environment Variables Configuration:', parsedEnv.error.format());
  process.exit(1);
}

module.exports = parsedEnv.data;
