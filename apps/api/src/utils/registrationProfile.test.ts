import test from 'node:test';
import assert from 'node:assert/strict';
import { isProfileCompleteForRegistration } from './registrationIntake.js';

process.env.NODE_ENV = 'test';

test('profile complete only when phone, course, branch and year are all present', () => {
  assert.equal(
    isProfileCompleteForRegistration({ phone: '9999999999', course: 'B.Tech', branch: 'CSE', year: '2' }),
    true,
  );
});

test('each missing academic field makes the profile incomplete', () => {
  const full = { phone: '9999999999', course: 'B.Tech', branch: 'CSE', year: '2' };
  for (const field of ['phone', 'course', 'branch', 'year'] as const) {
    assert.equal(
      isProfileCompleteForRegistration({ ...full, [field]: null }),
      false,
      `${field}=null should be incomplete`,
    );
    assert.equal(
      isProfileCompleteForRegistration({ ...full, [field]: '' }),
      false,
      `${field}='' should be incomplete`,
    );
    assert.equal(
      isProfileCompleteForRegistration({ ...full, [field]: undefined }),
      false,
      `${field}=undefined should be incomplete`,
    );
  }
});

test('empty user object is incomplete', () => {
  assert.equal(isProfileCompleteForRegistration({}), false);
});
