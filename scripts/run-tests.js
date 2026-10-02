const { readdirSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const testsDir = path.resolve(__dirname, '..', 'tests');
const testFiles = readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  console.error('No test files found in tests/*.test.js');
  process.exit(1);
}

let failures = 0;

for (const file of testFiles) {
  console.log('\n=== ' + file + ' ===');
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    failures += 1;
    console.error('Failed to start ' + file + ':', result.error);
    continue;
  }

  if (result.status !== 0) {
    failures += 1;
    console.error(file + ' exited with status ' + (result.status ?? 'unknown'));
  }
}

if (failures > 0) {
  console.error('\n' + failures + ' test file(s) failed.');
  process.exit(1);
}

console.log('\nAll ' + testFiles.length + ' test files passed.');
