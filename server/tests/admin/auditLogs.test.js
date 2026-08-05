// server/tests/admin/auditLogs.test.js
// GET /api/v1/admin/audit-logs (docs/07_EXECUTION_PLAN.md 11.5, audit-log-
// viewer half; docs/04_API_SPEC.md §7). Structure mirrors
// tests/admin/orders.test.js's established supertest style. Rows are looked
// up by id (`byId` map), never by absolute array position/length, since this
// is a shared jest --runInBand test DB that other test files' own admin-
// mutation audit rows also accumulate into across the whole run (same
// "look up by id, don't assert exact totals" discipline
// tests/admin/orders.test.js's own `GET /admin/orders` happy-path test
// already established for the analogous flat, unfiltered, shared-DB list
// endpoint).
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';

const { sequelize, AuditLog } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/admin/audit-logs', () => {
  test('happy path: shape, newest-first ordering, actorName resolution, null-actor row, summary/ip null-coercion', async () => {
    const { agent, user: admin } = await createAdminSession(app);

    const row1 = await AuditLog.create({
      actorUserId: admin.id,
      action: 'course.create',
      entityType: 'Course',
      entityId: 101,
      summary: 'Created course "Test Course".',
      ip: '203.0.113.10',
    });
    // System-triggered row: no actor at all.
    const row2 = await AuditLog.create({
      actorUserId: null,
      action: 'system.cron_sweep',
      entityType: 'Enrollment',
      entityId: null,
      summary: null,
      ip: null,
    });
    const row3 = await AuditLog.create({
      actorUserId: admin.id,
      action: 'order.mark_paid',
      entityType: 'Order',
      entityId: 555,
      summary: 'Manually marked order #555 as PAID.',
      ip: '203.0.113.11',
    });

    const res = await agent.get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const byId = new Map(res.body.data.map((r) => [r.id, r]));

    const r1 = byId.get(row1.id);
    expect(r1).toMatchObject({
      id: row1.id,
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'course.create',
      entityType: 'Course',
      entityId: 101,
      summary: 'Created course "Test Course".',
      ip: '203.0.113.10',
    });
    expect(r1.createdAt).toBeTruthy();

    const r2 = byId.get(row2.id);
    expect(r2.actorUserId).toBeUndefined();
    expect(r2.actorName).toBeUndefined();
    expect(r2.entityId).toBeUndefined();
    // Coerced to "" (never null) — the frontend's AuditLog TS type declares
    // both as required non-optional `string` and calls
    // `row.summary.toLowerCase()` unconditionally (task brief).
    expect(r2.summary).toBe('');
    expect(r2.ip).toBe('');

    const r3 = byId.get(row3.id);
    expect(r3.actorUserId).toBe(admin.id);
    expect(r3.actorName).toBe(admin.name);

    // Newest-first (by id desc): row3 (created last) sorts before row2 before row1.
    const idx1 = res.body.data.findIndex((r) => r.id === row1.id);
    const idx2 = res.body.data.findIndex((r) => r.id === row2.id);
    const idx3 = res.body.data.findIndex((r) => r.id === row3.id);
    expect(idx3).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx1);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
