// server/tests/notifications/notifications.test.js
// GET /notifications, POST /notifications/read (docs/07_EXECUTION_PLAN.md
// 10.3, docs/04_API_SPEC.md). Structure mirrors tests/admin/coupons.test.js's
// established supertest style.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createVerifiedUser, uniqueEmail, DEFAULT_TEST_PASSWORD } from '../helpers/testUsers.js';
import { loginNewDeviceAndReverify } from '../helpers/loginFlow.js';
import { createNotification } from '../helpers/studentFixtures.js';

const { sequelize, Notification } = db;

afterAll(async () => {
  await sequelize.close();
});

async function studentSession(prefix) {
  const email = uniqueEmail(prefix);
  const { user } = await createVerifiedUser({ email });
  const { agent } = await loginNewDeviceAndReverify(app, { email, password: DEFAULT_TEST_PASSWORD, userAgent: `${prefix}-agent/1.0` });
  return { agent, user, email };
}

describe('GET /api/v1/notifications', () => {
  test('happy path: returns only the caller\'s own rows, newest-first', async () => {
    const { agent, user } = await studentSession('notif-own');
    const { user: otherUser } = await studentSession('notif-other');

    const older = await createNotification(user, { type: 'purchase_paid', title: 'Older', createdAt: new Date(Date.now() - 60_000) });
    const newer = await createNotification(user, { type: 'announcement', title: 'Newer' });
    await createNotification(otherUser, { type: 'purchase_paid', title: 'Not mine' });

    const res = await agent.get('/api/v1/notifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((n) => n.id);
    expect(ids).toContain(older.id);
    expect(ids).toContain(newer.id);
    expect(res.body.data.every((n) => n.userId === user.id)).toBe(true);

    // newest-first
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  test('edge: ?unread=1 filters to only unread rows', async () => {
    const { agent, user } = await studentSession('notif-unread');
    const readOne = await createNotification(user, { type: 'purchase_paid', title: 'Read one', isRead: true });
    const unreadOne = await createNotification(user, { type: 'announcement', title: 'Unread one', isRead: false });

    const res = await agent.get('/api/v1/notifications?unread=1');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((n) => n.id);
    expect(ids).toContain(unreadOne.id);
    expect(ids).not.toContain(readOne.id);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/notifications/read', () => {
  test('happy path: ids[] marks only those notifications read', async () => {
    const { agent, user } = await studentSession('notif-markids');
    const a = await createNotification(user, { type: 'purchase_paid', title: 'A' });
    const b = await createNotification(user, { type: 'announcement', title: 'B' });

    const res = await agent.post('/api/v1/notifications/read').send({ ids: [a.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const aAfter = await Notification.findByPk(a.id);
    const bAfter = await Notification.findByPk(b.id);
    expect(aAfter.isRead).toBe(true);
    expect(bAfter.isRead).toBe(false);
  });

  test('happy path: all:true marks every notification for the caller read', async () => {
    const { agent, user } = await studentSession('notif-markall');
    const a = await createNotification(user, { type: 'purchase_paid', title: 'A' });
    const b = await createNotification(user, { type: 'announcement', title: 'B' });

    const res = await agent.post('/api/v1/notifications/read').send({ all: true });
    expect(res.status).toBe(200);

    const aAfter = await Notification.findByPk(a.id);
    const bAfter = await Notification.findByPk(b.id);
    expect(aAfter.isRead).toBe(true);
    expect(bAfter.isRead).toBe(true);
  });

  test('edge (IDOR): posting an id belonging to another user is a silent no-op, not an error', async () => {
    const { agent } = await studentSession('notif-idor-caller');
    const { user: victim } = await studentSession('notif-idor-victim');
    const victimNotification = await createNotification(victim, { type: 'purchase_paid', title: 'Victim notification' });

    const res = await agent.post('/api/v1/notifications/read').send({ ids: [victimNotification.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const victimAfter = await Notification.findByPk(victimNotification.id);
    expect(victimAfter.isRead).toBe(false);
  });

  test('validation failure: neither ids nor all → 422', async () => {
    const { agent } = await studentSession('notif-validation');
    const res = await agent.post('/api/v1/notifications/read').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/notifications/read').send({ all: true });
    expect(res.status).toBe(401);
  });
});
