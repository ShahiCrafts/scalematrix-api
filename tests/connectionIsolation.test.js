const assert = require('assert');
const Connection = require('../src/models/Connection');

async function testConnectionIsolation() {
  console.log('🧪 Testing Connection Model for Zero Token Storage...');

  // Verify Connection schema does not include raw access/refresh token fields
  const connectionPaths = Object.keys(Connection.schema.paths);
  assert.strictEqual(connectionPaths.includes('accessToken'), false, 'Connection model must NOT contain accessToken');
  assert.strictEqual(connectionPaths.includes('refreshToken'), false, 'Connection model must NOT contain refreshToken');
  assert.strictEqual(connectionPaths.includes('tokenSecret'), false, 'Connection model must NOT contain tokenSecret');
  assert.strictEqual(connectionPaths.includes('encryptedData'), false, 'Connection model must NOT contain encryptedData');

  assert.ok(connectionPaths.includes('composioConnectionId'), 'Connection model must store composioConnectionId reference');
  assert.ok(connectionPaths.includes('composioEntityId'), 'Connection model must store composioEntityId reference');

  console.log('✅ PASS: Verified zero raw third-party tokens stored in Connection schema!');
}

if (require.main === module) {
  testConnectionIsolation().catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
  });
}

module.exports = testConnectionIsolation;
