// server/tests/helpers/adminSession.js
// Shared helper for Phase 4 admin-route supertest specs: creates a real
// admin user + completes a real login/reverify flow (auth.js's `auth` +
// deviceCheck.js's `deviceCheck` middleware both need genuine
// access_token/device_token cookies, not just a bare JWT — see
// requireRole.test.js's comment for why *that* file gets away with a bare
// token: it only exercises `auth`+`requireRole`, never `deviceCheck`).
import request from 'supertest';
import { createVerifiedUser, uniqueEmail } from './testUsers.js';
import { loginNewDeviceAndReverify } from './loginFlow.js';

/** Creates an active admin user and returns a fully-authenticated supertest agent (real access/refresh/device cookies) for it. */
export async function createAdminSession(app, { userAgent = 'jest-admin-agent/1.0' } = {}) {
  const { user, email, password } = await createVerifiedUser({ email: uniqueEmail('admin'), role: 'admin', name: 'Test Admin' });
  const agent = request.agent(app);
  const loginRes = await agent.post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, password });
  if (loginRes.status !== 200) {
    throw new Error(`createAdminSession: expected 200, got ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }
  return { agent, user, email, password };
}

/** Creates an active student user and returns a fully-authenticated supertest agent — used by every admin-route test's 403-for-wrong-role case. */
export async function createStudentSession(app, { userAgent = 'jest-student-agent/1.0' } = {}) {
  const { user, email, password } = await createVerifiedUser({ email: uniqueEmail('student'), role: 'student', name: 'Test Student' });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password, userAgent });
  return { agent, user, email, password };
}

export default createAdminSession;
