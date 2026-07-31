// server/tests/admin/messages.test.js
// GET /admin/messages (+ ?status= filter), PATCH /admin/messages/:id/status
// (docs/07_EXECUTION_PLAN.md Phase 4.1/4.4; mounted at `/admin/messages`,
// not the spec's literal `/admin/contact-messages` — see DECISIONS.md).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';

const { sequelize, AuditLog, ContactMessage } = db;

afterAll(async () => {
  await sequelize.close();
});

async function createMessage(overrides = {}) {
  return ContactMessage.create({
    name: 'Test Sender',
    email: `sender-${Date.now()}-${Math.random()}@example.test`,
    subject: 'Question about NRE course',
    message: 'Does this course include QBank access?',
    status: 'new',
    ...overrides,
  });
}

describe('GET /api/v1/admin/messages', () => {
  test('happy path: lists messages, newest first', async () => {
    const { agent } = await createAdminSession(app);
    const msg = await createMessage();

    const res = await agent.get('/api/v1/admin/messages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((m) => m.id === msg.id)).toBe(true);
  });

  test('happy path: ?status= filter', async () => {
    const { agent } = await createAdminSession(app);
    const replied = await createMessage({ status: 'replied' });

    const res = await agent.get('/api/v1/admin/messages?status=replied');
    expect(res.status).toBe(200);
    expect(res.body.data.every((m) => m.status === 'replied')).toBe(true);
    expect(res.body.data.some((m) => m.id === replied.id)).toBe(true);
  });

  test('validation failure: invalid status value → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/messages?status=bogus');
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/messages');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/messages');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/messages/:id/status', () => {
  test('happy path: new -> read -> replied, audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const msg = await createMessage({ status: 'new' });

    const readRes = await agent.patch(`/api/v1/admin/messages/${msg.id}/status`).send({ status: 'read' });
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.status).toBe('read');

    const repliedRes = await agent.patch(`/api/v1/admin/messages/${msg.id}/status`).send({ status: 'replied' });
    expect(repliedRes.status).toBe(200);
    expect(repliedRes.body.data.status).toBe('replied');

    const auditRow = await AuditLog.findOne({ where: { action: 'contact_message.update_status', entityId: msg.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('validation failure: invalid status → 422', async () => {
    const { agent } = await createAdminSession(app);
    const msg = await createMessage();
    const res = await agent.patch(`/api/v1/admin/messages/${msg.id}/status`).send({ status: 'archived' });
    expect(res.status).toBe(422);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/messages/9999999/status').send({ status: 'read' });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const msg = await createMessage();
    const res = await request(app).patch(`/api/v1/admin/messages/${msg.id}/status`).send({ status: 'read' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const msg = await createMessage();
    const res = await agent.patch(`/api/v1/admin/messages/${msg.id}/status`).send({ status: 'read' });
    expect(res.status).toBe(403);
  });
});
