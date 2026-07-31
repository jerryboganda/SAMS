// server/tests/helpers/testUsers.js
// Shared test-setup helpers: creating users directly via the model layer
// (bypassing the register/verify-email HTTP round trip when a test only
// needs "some active user with a known password", not to re-test
// registration itself) and generating collision-free emails per test.
import bcrypt from 'bcrypt';
import db from '../../src/models/index.js';

const { User } = db;

// Low bcrypt cost for test-only password hashing — bcrypt.compare() still
// validates correctly regardless of the cost embedded in the hash; using 4
// instead of the real BCRYPT_ROUNDS=12 (server/src/services/authService.js)
// keeps this large a test suite fast. Endpoints that hash a NEW password
// themselves (register, reset-password, change-password) are unaffected —
// they always use the real service code path at its real cost.
const TEST_BCRYPT_ROUNDS = 4;

let counter = 0;

/** Collision-free email for a fresh test user/registration. */
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.test`;
}

export const DEFAULT_TEST_PASSWORD = 'Password@123';

/** Creates an already-active, already-verified user directly (skips email verification flow). */
export async function createVerifiedUser({
  email = uniqueEmail(),
  password = DEFAULT_TEST_PASSWORD,
  name = 'Test User',
  role = 'student',
} = {}) {
  const passwordHash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    status: 'active',
    emailVerifiedAt: new Date(),
  });
  return { user, email, password };
}
