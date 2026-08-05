// server/tests/admin/taxonomy.test.js
// Admin QBank taxonomy (Subjects/Systems) CRUD (docs/07_EXECUTION_PLAN.md
// Phase 11.3). Structure/rigor mirrors tests/admin/coupons.test.js's
// established supertest style.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createSubject, createBodySystem, createQuestionWithOptions } from '../helpers/publicFixtures.js';

const { sequelize, AuditLog, Subject, BodySystem } = db;

afterAll(async () => {
  await sequelize.close();
});

let counter = 0;
function uniqueName(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

describe('GET /api/v1/admin/taxonomy', () => {
  test('happy path: subjects/systems with questionsCount computed', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('Subj') });
    const system = await createBodySystem({ name: uniqueName('Sys') });
    await createQuestionWithOptions({ subject, system });
    await createQuestionWithOptions({ subject, system });
    const emptySubject = await createSubject({ name: uniqueName('EmptySubj') });

    const res = await agent.get('/api/v1/admin/taxonomy');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.subjects)).toBe(true);
    expect(Array.isArray(res.body.data.systems)).toBe(true);

    const subjRow = res.body.data.subjects.find((s) => s.id === subject.id);
    expect(subjRow.questionsCount).toBe(2);
    const sysRow = res.body.data.systems.find((s) => s.id === system.id);
    expect(sysRow.questionsCount).toBe(2);
    const emptyRow = res.body.data.subjects.find((s) => s.id === emptySubject.id);
    expect(emptyRow.questionsCount).toBe(0);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/taxonomy');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/taxonomy');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/taxonomy/subjects', () => {
  test('happy path: creates a subject, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const name = uniqueName('NewSubject');
    const res = await agent.post('/api/v1/admin/taxonomy/subjects').send({ name });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(name);
    expect(res.body.data.questionsCount).toBe(0);

    const auditRow = await AuditLog.findOne({ where: { action: 'subject.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('conflict: duplicate name → 409', async () => {
    const { agent } = await createAdminSession(app);
    const name = uniqueName('DupSubject');
    const first = await agent.post('/api/v1/admin/taxonomy/subjects').send({ name });
    expect(first.status).toBe(201);
    const second = await agent.post('/api/v1/admin/taxonomy/subjects').send({ name });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  test('validation failure: empty name → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/taxonomy/subjects').send({ name: '' });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/taxonomy/subjects').send({ name: uniqueName('NoAuth') });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/taxonomy/subjects').send({ name: uniqueName('Role') });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/taxonomy/subjects/:id', () => {
  test('happy path: renames a subject, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('OldName') });
    const newName = uniqueName('RenamedSubject');
    const res = await agent.patch(`/api/v1/admin/taxonomy/subjects/${subject.id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(newName);

    const auditRow = await AuditLog.findOne({ where: { action: 'subject.update', entityId: subject.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/taxonomy/subjects/9999999').send({ name: uniqueName('X') });
    expect(res.status).toBe(404);
  });

  test('conflict: renaming to an already-used name → 409', async () => {
    const { agent } = await createAdminSession(app);
    const existing = await createSubject({ name: uniqueName('Taken') });
    const target = await createSubject({ name: uniqueName('ToRename') });
    const res = await agent.patch(`/api/v1/admin/taxonomy/subjects/${target.id}`).send({ name: existing.name });
    expect(res.status).toBe(409);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject({ name: uniqueName('Auth') });
    const res = await request(app).patch(`/api/v1/admin/taxonomy/subjects/${subject.id}`).send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject({ name: uniqueName('Role2') });
    const res = await agent.patch(`/api/v1/admin/taxonomy/subjects/${subject.id}`).send({ name: uniqueName('y') });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/taxonomy/subjects/:id', () => {
  test('happy path: deletes an unused subject, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('Deletable') });

    const res = await agent.delete(`/api/v1/admin/taxonomy/subjects/${subject.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const gone = await Subject.findByPk(subject.id);
    expect(gone).toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'subject.delete', entityId: subject.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('deletability guard: a subject with questions attached → 409, not deleted', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('InUseSubject') });
    const system = await createBodySystem({ name: uniqueName('AnySystem') });
    await createQuestionWithOptions({ subject, system });

    const res = await agent.delete(`/api/v1/admin/taxonomy/subjects/${subject.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const stillThere = await Subject.findByPk(subject.id);
    expect(stillThere).not.toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/taxonomy/subjects/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const subject = await createSubject({ name: uniqueName('NoAuthDel') });
    const res = await request(app).delete(`/api/v1/admin/taxonomy/subjects/${subject.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const subject = await createSubject({ name: uniqueName('RoleDel') });
    const res = await agent.delete(`/api/v1/admin/taxonomy/subjects/${subject.id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/taxonomy/systems', () => {
  test('happy path: creates a system, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const name = uniqueName('NewSystem');
    const res = await agent.post('/api/v1/admin/taxonomy/systems').send({ name });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(name);

    const auditRow = await AuditLog.findOne({ where: { action: 'system.create', entityId: res.body.data.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('conflict: duplicate name → 409', async () => {
    const { agent } = await createAdminSession(app);
    const name = uniqueName('DupSystem');
    const first = await agent.post('/api/v1/admin/taxonomy/systems').send({ name });
    expect(first.status).toBe(201);
    const second = await agent.post('/api/v1/admin/taxonomy/systems').send({ name });
    expect(second.status).toBe(409);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/taxonomy/systems').send({ name: uniqueName('NoAuth') });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/taxonomy/systems').send({ name: uniqueName('Role') });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/admin/taxonomy/systems/:id', () => {
  test('happy path: renames a system, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const system = await createBodySystem({ name: uniqueName('OldSysName') });
    const newName = uniqueName('RenamedSystem');
    const res = await agent.patch(`/api/v1/admin/taxonomy/systems/${system.id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(newName);

    const auditRow = await AuditLog.findOne({ where: { action: 'system.update', entityId: system.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.patch('/api/v1/admin/taxonomy/systems/9999999').send({ name: uniqueName('X') });
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const system = await createBodySystem({ name: uniqueName('AuthSys') });
    const res = await request(app).patch(`/api/v1/admin/taxonomy/systems/${system.id}`).send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const system = await createBodySystem({ name: uniqueName('RoleSys') });
    const res = await agent.patch(`/api/v1/admin/taxonomy/systems/${system.id}`).send({ name: uniqueName('y') });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/taxonomy/systems/:id', () => {
  test('happy path: deletes an unused system, audit logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const system = await createBodySystem({ name: uniqueName('DeletableSys') });

    const res = await agent.delete(`/api/v1/admin/taxonomy/systems/${system.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);

    const gone = await BodySystem.findByPk(system.id);
    expect(gone).toBeNull();

    const auditRow = await AuditLog.findOne({ where: { action: 'system.delete', entityId: system.id } });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);
  });

  test('deletability guard: a system with questions attached → 409, not deleted', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('AnySubject') });
    const system = await createBodySystem({ name: uniqueName('InUseSystem') });
    await createQuestionWithOptions({ subject, system });

    const res = await agent.delete(`/api/v1/admin/taxonomy/systems/${system.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');

    const stillThere = await BodySystem.findByPk(system.id);
    expect(stillThere).not.toBeNull();
  });

  test('not found: unknown id → 404', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.delete('/api/v1/admin/taxonomy/systems/9999999');
    expect(res.status).toBe(404);
  });

  test('auth failure: no session → 401', async () => {
    const system = await createBodySystem({ name: uniqueName('NoAuthDelSys') });
    const res = await request(app).delete(`/api/v1/admin/taxonomy/systems/${system.id}`);
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const system = await createBodySystem({ name: uniqueName('RoleDelSys') });
    const res = await agent.delete(`/api/v1/admin/taxonomy/systems/${system.id}`);
    expect(res.status).toBe(403);
  });
});
