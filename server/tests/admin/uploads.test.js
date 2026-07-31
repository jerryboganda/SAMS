// server/tests/admin/uploads.test.js
// POST /admin/uploads/image (docs/07_EXECUTION_PLAN.md Phase 4.1,
// docs/10_SECURITY_CHECKLIST.md §G: mime + magic-byte check, 5 MB cap,
// randomized names).
import { afterAll, afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { UPLOADS_DIR } from '../../src/services/adminUploadService.js';

const { sequelize, AuditLog } = db;

// A minimal, valid 1x1 PNG (real magic bytes + real PNG structure).
const REAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const writtenFiles = [];

afterEach(async () => {
  // Clean up files this test file actually wrote to the real storage/uploads dir.
  await Promise.all(
    writtenFiles.splice(0).map(async (rel) => {
      try {
        await fsp.unlink(path.join(UPLOADS_DIR, rel));
      } catch {
        // already gone / never created — fine
      }
    })
  );
});

afterAll(async () => {
  await sequelize.close();
});

describe('POST /api/v1/admin/uploads/image', () => {
  test('happy path: a real PNG is accepted, saved under a randomized filename, and audit-logged', async () => {
    const { agent, user } = await createAdminSession(app);
    const buffer = Buffer.from(REAL_PNG_BASE64, 'base64');

    const res = await agent
      .post('/api/v1/admin/uploads/image')
      .attach('file', buffer, { filename: 'thumbnail.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    expect(res.body.data.url).not.toContain('thumbnail'); // original filename never used

    const savedFilename = res.body.data.url.replace('/uploads/', '');
    writtenFiles.push(savedFilename);
    expect(fs.existsSync(path.join(UPLOADS_DIR, savedFilename))).toBe(true);

    const auditRow = await AuditLog.findOne({ where: { action: 'upload.create' }, order: [['id', 'DESC']] });
    expect(auditRow).not.toBeNull();
    expect(auditRow.actorUserId).toBe(user.id);

    // Served back statically with the correct content-type.
    const served = await request(app).get(res.body.data.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toMatch(/image\/png/);
  });

  test('edge (magic-byte check): a renamed .exe with a fake image/png content-type and .png extension is rejected → 422', async () => {
    const { agent } = await createAdminSession(app);
    // Real Windows PE executable magic bytes ("MZ...") — not an image, no
    // matter what filename/Content-Type the client declares.
    const fakeExeAsPng = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

    const res = await agent
      .post('/api/v1/admin/uploads/image')
      .attach('file', fakeExeAsPng, { filename: 'totally-a-thumbnail.png', contentType: 'image/png' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation failure: no file attached → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/uploads/image');
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const buffer = Buffer.from(REAL_PNG_BASE64, 'base64');
    const res = await request(app)
      .post('/api/v1/admin/uploads/image')
      .attach('file', buffer, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const buffer = Buffer.from(REAL_PNG_BASE64, 'base64');
    const res = await agent
      .post('/api/v1/admin/uploads/image')
      .attach('file', buffer, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});
