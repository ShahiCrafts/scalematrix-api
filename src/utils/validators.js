const { z } = require('zod');

const registerSchema = z.object({
  fullName: z.string().trim().optional(),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const verifyOTPSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  otp: z.string().trim().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

const resendOTPSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const githubAuthSchema = z.object({
  code: z.string().min(1, 'GitHub authorization code is required'),
});

const completeOnboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  role: z.string().trim().optional(),
  targetAudience: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  contentFormats: z.array(z.string()).optional(),
  primaryGoal: z.string().trim().optional(),
  publishingFrequency: z.string().trim().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyOTPSchema,
  resendOTPSchema,
  googleAuthSchema,
  githubAuthSchema,
  completeOnboardingSchema,
};
