const mongoose = require('mongoose');
const assert = require('assert');
const env = require('../src/config/env');
const User = require('../src/models/User');
const TokenService = require('../src/services/TokenService');
const { authenticateJWT } = require('../src/middleware/authMiddleware');

async function testSessionInvalidation() {
  console.log('🧪 Testing Session Invalidation after DB Wipe & Token Versioning...');

  await mongoose.connect(env.MONGODB_URI);

  try {
    const timestamp = Date.now();
    const email = `session_wipe_${timestamp}@example.com`;

    // 1. Create a user
    const user = await User.create({
      email,
      fullName: 'Session Wipe Test User',
      isEmailVerified: true,
      tokenVersion: 0,
    });

    // 2. Issue Access Token
    const token = TokenService.generateAccessToken(user);
    assert.ok(token, 'Access token generated successfully');

    // Helper to invoke Express middleware as a promise in tests
    const runMiddleware = (req, res) =>
      new Promise((resolve, reject) => {
        authenticateJWT(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

    // 3. Assert initial request succeeds via middleware mock
    const reqMock = { headers: { authorization: `Bearer ${token}` } };
    const resMock = {};

    await runMiddleware(reqMock, resMock);

    assert.strictEqual(reqMock.user._id.toString(), user._id.toString());
    console.log('  ✓ Valid user token passed authentication');

    // 4. Test Scenario A: Delete user directly from MongoDB (Simulate DB Wipe)
    await User.findByIdAndDelete(user._id);

    let errorThrownA = null;
    try {
      await runMiddleware({ headers: { authorization: `Bearer ${token}` } }, resMock);
    } catch (err) {
      errorThrownA = err;
    }

    assert.ok(errorThrownA, 'Middleware must throw error when user is deleted from MongoDB');
    assert.strictEqual(errorThrownA.statusCode, 401, 'Must return 401 status code');
    assert.ok(
      errorThrownA.message.includes('User account no longer exists'),
      `Error message should indicate missing user: ${errorThrownA.message}`
    );
    console.log('  ✓ Authenticated request returned 401 after user deleted from MongoDB');

    // 5. Test Scenario B: tokenVersion mismatch invalidates session
    const userB = await User.create({
      email: `session_version_${timestamp}@example.com`,
      fullName: 'Token Version Test User',
      isEmailVerified: true,
      tokenVersion: 0,
    });

    const tokenB = TokenService.generateAccessToken(userB);

    // Increment tokenVersion in DB (Revoke all active sessions)
    userB.tokenVersion += 1;
    await userB.save();

    let errorThrownB = null;
    try {
      await runMiddleware({ headers: { authorization: `Bearer ${tokenB}` } }, resMock);
    } catch (err) {
      errorThrownB = err;
    }

    assert.ok(errorThrownB, 'Middleware must throw error on tokenVersion mismatch');
    assert.strictEqual(errorThrownB.statusCode, 401, 'Must return 401 status code');
    assert.ok(
      errorThrownB.message.includes('Session revoked'),
      `Error message should indicate session revocation: ${errorThrownB.message}`
    );
    console.log('  ✓ Incrementing tokenVersion in DB returned 401 on old token');

    // Cleanup
    await User.findByIdAndDelete(userB._id);

    console.log('✅ PASS: All Session Invalidation tests passed successfully!');
  } catch (err) {
    console.error('❌ Session Invalidation test failed:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

testSessionInvalidation();
