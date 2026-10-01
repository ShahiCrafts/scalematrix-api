const jwt = require('jsonwebtoken');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const { hashString } = require('../utils/crypto');

class TokenService {
  /**
   * Generate JWT Access Token (short lived)
   */
  static generateAccessToken(user) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      activeOrganization: user.activeOrganization ? user.activeOrganization.toString() : null,
      tokenVersion: user.tokenVersion || 0,
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    });
  }

  /**
   * Generate JWT Refresh Token & store token hash in MongoDB
   */
  static async generateRefreshToken(user, req) {
    const payload = {
      sub: user._id.toString(),
      jti: require('crypto').randomBytes(16).toString('hex'), // unique token ID
    };

    const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    });

    const tokenHash = hashString(token);
    const deviceInfo = req?.headers?.['user-agent'] || 'Unknown Device';
    const ipAddress = req?.ip || req?.connection?.remoteAddress || '';
    
    // Default 7 days expiry date for DB TTL tracking
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      deviceInfo,
      ipAddress,
      expiresAt,
    });

    return token;
  }

  /**
   * Verify Access Token
   */
  static verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  }

  /**
   * Verify Refresh Token and check existence in DB
   */
  static async verifyRefreshToken(token) {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    const tokenHash = hashString(token);

    const storedToken = await RefreshToken.findOne({
      userId: decoded.sub,
      tokenHash,
    });

    if (!storedToken) {
      throw new Error('Refresh token revoked or invalid');
    }

    return { decoded, storedToken };
  }

  /**
   * Revoke single Refresh Token in DB
   */
  static async revokeRefreshToken(token) {
    if (!token) return;
    const tokenHash = hashString(token);
    await RefreshToken.deleteOne({ tokenHash });
  }

  /**
   * Revoke all refresh tokens for a user (e.g. password reset / logout all devices)
   */
  static async revokeAllUserRefreshTokens(userId) {
    await RefreshToken.deleteMany({ userId });
  }

  /**
   * Set HttpOnly secure refresh token cookie on response
   */
  static setRefreshTokenCookie(res, token) {
    const isProduction = env.NODE_ENV === 'production';
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'none' : 'lax', // Allow cross-origin auth in dev if needed
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth', // Restrict cookie path to auth endpoints only
    });
  }

  /**
   * Clear refresh token cookie
   */
  static clearRefreshTokenCookie(res) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/api/v1/auth',
    });
  }
}

module.exports = TokenService;
