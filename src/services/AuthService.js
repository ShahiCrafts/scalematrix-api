const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const OTP = require('../models/OTP');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const MailService = require('./MailService');
const TokenService = require('./TokenService');
const { generateNumericOTP, hashString } = require('../utils/crypto');
const env = require('../config/env');

class AuthService {
  /**
   * Helper to write security audit log entry
   */
  static async logAuditEvent({ userId, workspaceId = null, action, req, metadata = {} }) {
    try {
      const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.connection?.remoteAddress || '';
      const userAgent = req?.headers?.['user-agent'] || '';
      await AuditLog.create({
        userId,
        workspaceId,
        action,
        ipAddress,
        userAgent,
        metadata,
      });
    } catch (err) {
      console.error('⚠️ Failed to create audit log entry:', err.message);
    }
  }

  /**
   * Register a new user & dispatch OTP verification email
   */
  static async registerUser({ email, password, fullName = '' }) {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        throw ApiError.conflict('An account with this email address already exists.');
      }
      if (fullName) existingUser.fullName = fullName;
      existingUser.passwordHash = password;
      await existingUser.save();
      
      const otpCode = await this.generateAndSaveOTP(email);
      await MailService.sendOTPEmail(email, otpCode, existingUser.fullName || email.split('@')[0]);

      return {
        message: 'Account registration updated. Verification code sent to email.',
        user: { id: existingUser._id, email: existingUser.email, fullName: existingUser.fullName, isEmailVerified: false },
      };
    }

    const newUser = await User.create({
      email,
      passwordHash: password,
      fullName: fullName || '',
      isEmailVerified: false,
    });

    const otpCode = await this.generateAndSaveOTP(email);
    await MailService.sendOTPEmail(email, otpCode, fullName || email.split('@')[0]);

    return {
      message: 'Registration successful. Please verify your email with the OTP sent to your inbox.',
      user: { id: newUser._id, email: newUser.email, fullName: newUser.fullName, isEmailVerified: false },
    };
  }

  /**
   * Helper to generate cryptographically secure OTP and save SHA-256 hash to DB
   */
  static async generateAndSaveOTP(email, purpose = 'email_verification') {
    await OTP.deleteMany({ email, purpose });

    const otpCode = generateNumericOTP();
    const otpHash = hashString(otpCode);

    await OTP.create({
      email,
      otpHash,
      purpose,
      attemptsLeft: 3,
    });

    return otpCode;
  }

  /**
   * Verify OTP and activate or provision user account
   */
  static async verifyOTP({ email, otp }, req, res) {
    const otpRecord = await OTP.findOne({ email, purpose: 'email_verification' });
    if (!otpRecord) {
      throw ApiError.badRequest('Verification code expired or invalid. Please request a new code.');
    }

    if (otpRecord.attemptsLeft <= 0) {
      await OTP.deleteOne({ _id: otpRecord._id });
      throw ApiError.badRequest('Maximum verification attempts exceeded. Please request a new code.');
    }

    const providedOtpHash = hashString(otp);
    if (providedOtpHash !== otpRecord.otpHash) {
      otpRecord.attemptsLeft -= 1;
      await otpRecord.save();
      throw ApiError.badRequest(`Invalid verification code. ${otpRecord.attemptsLeft} attempts remaining.`);
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        fullName: '',
        isEmailVerified: true,
      });
    } else {
      user.isEmailVerified = true;
      await user.save();
    }

    await OTP.deleteOne({ _id: otpRecord._id });

    const accessToken = TokenService.generateAccessToken(user);
    const refreshToken = await TokenService.generateRefreshToken(user, req);

    TokenService.setRefreshTokenCookie(res, refreshToken);

    await this.logAuditEvent({
      userId: user._id,
      workspaceId: user.activeOrganization,
      action: 'login_otp',
      req,
      metadata: { method: 'otp' },
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        activeOrganization: user.activeOrganization,
      },
      accessToken,
    };
  }

  /**
   * Resend OTP Verification Code
   */
  static async resendOTP({ email }) {
    const user = await User.findOne({ email });

    if (user && user.isEmailVerified) {
      throw ApiError.badRequest('This email address is already verified');
    }

    const otpCode = await this.generateAndSaveOTP(email);
    await MailService.sendOTPEmail(email, otpCode, user?.fullName || '');

    return { message: 'A new verification code has been sent to your email.' };
  }

  /**
   * Login or register with Email & Password
   */
  static async loginUser({ email, password }, req, res) {
    let user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      user = await User.create({
        email,
        passwordHash: password,
        fullName: '',
        isEmailVerified: true,
      });
    } else if (!user.passwordHash) {
      user.passwordHash = password;
      user.isEmailVerified = true;
      await user.save();
    } else {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw ApiError.unauthorized('Invalid email or password');
      }
    }

    if (!user.isEmailVerified) {
      const otpCode = await this.generateAndSaveOTP(email);
      await MailService.sendOTPEmail(email, otpCode, user.fullName);
      throw ApiError.forbidden('Email address not verified. A new verification code has been sent to your email.');
    }

    const accessToken = TokenService.generateAccessToken(user);
    const refreshToken = await TokenService.generateRefreshToken(user, req);

    TokenService.setRefreshTokenCookie(res, refreshToken);

    await this.logAuditEvent({
      userId: user._id,
      workspaceId: user.activeOrganization,
      action: 'login_password',
      req,
      metadata: { method: 'password' },
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        activeOrganization: user.activeOrganization,
      },
      accessToken,
    };
  }

  /**
   * Google OAuth 2.0 Login / Signup via ID Token or Access Token
   */
  static async googleAuth({ idToken }, req, res) {
    let payload;
    try {
      if (!idToken) {
        throw new Error('Google token is required');
      }

      if (idToken.startsWith('ya29.')) {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!userinfoRes.ok) {
          throw new Error('Failed to fetch user profile with Google Access Token');
        }
        const userinfo = await userinfoRes.json();
        payload = {
          sub: userinfo.sub,
          email: userinfo.email,
          name: userinfo.name,
          picture: userinfo.picture,
        };
      } else {
        if (!env.GOOGLE_CLIENT_ID) {
          throw new Error('GOOGLE_CLIENT_ID is not configured on the server environment');
        }

        const client = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
        const ticket = await client.verifyIdToken({
          idToken,
          audience: env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      }
    } catch (err) {
      throw ApiError.unauthorized(`Google authentication failed: ${err.message}`);
    }

    const { sub: googleId, email, name: rawName, picture: avatar } = payload;
    const fullName = rawName || (email ? email.split('@')[0] : 'Google User');

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    let isLinked = false;

    if (!user) {
      user = await User.create({
        email,
        googleId,
        fullName,
        avatar: avatar || '',
        isEmailVerified: true,
      });
    } else {
      if (!user.googleId) {
        user.googleId = googleId;
        isLinked = true;
      }
      if (!user.isEmailVerified) user.isEmailVerified = true;
      if (!user.fullName) user.fullName = fullName;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    }

    const accessToken = TokenService.generateAccessToken(user);
    const refreshToken = await TokenService.generateRefreshToken(user, req);

    TokenService.setRefreshTokenCookie(res, refreshToken);

    await this.logAuditEvent({
      userId: user._id,
      workspaceId: user.activeOrganization,
      action: isLinked ? 'provider_linked' : 'login_oauth',
      req,
      metadata: { provider: 'google', googleId },
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        activeOrganization: user.activeOrganization,
      },
      accessToken,
    };
  }

  /**
   * GitHub OAuth 2.0 Login / Signup via code exchange
   */
  static async githubAuth({ code }, req, res) {
    let githubProfile;
    try {
      if (!env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_ID.includes('mock')) {
        console.warn('⚠️ Using mock GitHub OAuth in local development mode');
        githubProfile = {
          id: 'github_mock_12345',
          email: 'github.user@example.com',
          name: 'GitHub Test User',
          avatar_url: 'https://avatars.githubusercontent.com/u/0',
        };
      } else {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${tokenData.access_token}` },
        });
        githubProfile = await userRes.json();

        if (!githubProfile.email) {
          const emailsRes = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `token ${tokenData.access_token}` },
          });
          const emails = await emailsRes.json();
          const primaryEmail = emails.find((e) => e.primary && e.verified) || emails[0];
          if (primaryEmail) githubProfile.email = primaryEmail.email;
        }
      }
    } catch (err) {
      throw ApiError.unauthorized(`GitHub authentication failed: ${err.message}`);
    }

    const { id: githubIdStr, email, name: fullName, avatar_url: avatar } = githubProfile;
    const githubId = String(githubIdStr);

    if (!email) {
      throw ApiError.badRequest('Unable to retrieve email address from GitHub account');
    }

    let user = await User.findOne({ $or: [{ githubId }, { email }] });
    let isLinked = false;

    if (!user) {
      user = await User.create({
        email,
        githubId,
        fullName: fullName || 'GitHub User',
        avatar: avatar || '',
        isEmailVerified: true,
      });
    } else {
      if (!user.githubId) {
        user.githubId = githubId;
        isLinked = true;
      }
      if (!user.isEmailVerified) user.isEmailVerified = true;
      if (avatar && !user.avatar) user.avatar = avatar;
      await user.save();
    }

    const accessToken = TokenService.generateAccessToken(user);
    const refreshToken = await TokenService.generateRefreshToken(user, req);

    TokenService.setRefreshTokenCookie(res, refreshToken);

    await this.logAuditEvent({
      userId: user._id,
      workspaceId: user.activeOrganization,
      action: isLinked ? 'provider_linked' : 'login_oauth',
      req,
      metadata: { provider: 'github', githubId },
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        activeOrganization: user.activeOrganization,
      },
      accessToken,
    };
  }

  /**
   * Refresh JWT Tokens
   */
  static async refreshTokens(req, res) {
    const tokenFromCookie = req.cookies?.refreshToken;
    if (!tokenFromCookie) {
      throw ApiError.unauthorized('Refresh token cookie missing');
    }

    try {
      const { decoded, storedToken } = await TokenService.verifyRefreshToken(tokenFromCookie);
      
      const user = await User.findById(decoded.sub);
      if (!user) {
        throw ApiError.unauthorized('User associated with refresh token no longer exists');
      }

      await TokenService.revokeRefreshToken(tokenFromCookie);

      const newAccessToken = TokenService.generateAccessToken(user);
      const newRefreshToken = await TokenService.generateRefreshToken(user, req);

      TokenService.setRefreshTokenCookie(res, newRefreshToken);

      return { accessToken: newAccessToken };
    } catch (error) {
      TokenService.clearRefreshTokenCookie(res);
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user
   */
  static async logout(req, res) {
    const tokenFromCookie = req.cookies?.refreshToken;
    if (tokenFromCookie) {
      await TokenService.revokeRefreshToken(tokenFromCookie);
    }
    TokenService.clearRefreshTokenCookie(res);

    if (req.user?._id) {
      await this.logAuditEvent({
        userId: req.user._id,
        workspaceId: req.user.activeOrganization,
        action: 'logout',
        req,
      });
    }

    return { message: 'Logged out successfully' };
  }
}

module.exports = AuthService;
