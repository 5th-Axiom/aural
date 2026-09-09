import test from 'node:test';
import assert from 'node:assert/strict';
import { issueTestAccess, validTestAccess, matchesTestPassword } from '../src/lib/test-access';

test('test gateway rejects disabled, expired, tampered tokens and wrong passwords', () => {
  const before = { ...process.env };
  try {
    process.env.TEST_ACCESS_ENABLED = 'true';
    process.env.TEST_ACCESS_SECRET = 'a-test-only-secret';
    process.env.TEST_ACCESS_PASSWORD = 'test-password';
    const token = issueTestAccess();
    assert.equal(validTestAccess(token), true);
    assert.equal(validTestAccess(token + '.extra'), false);
    assert.equal(validTestAccess('1.' + token.split('.')[1]), false);
    assert.equal(validTestAccess(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')), false);
    assert.equal(validTestAccess(), false);
    assert.equal(matchesTestPassword('test-password'), true);
    assert.equal(matchesTestPassword('wrong'), false);
    process.env.TEST_ACCESS_ENABLED = 'false';
    assert.equal(validTestAccess(token), false);
  } finally {
    for (const key of ['TEST_ACCESS_ENABLED','TEST_ACCESS_SECRET','TEST_ACCESS_PASSWORD']) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});
