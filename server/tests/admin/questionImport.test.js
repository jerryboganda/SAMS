// server/tests/admin/questionImport.test.js
// Admin QBank CSV batch-import wizard (docs/07_EXECUTION_PLAN.md Phase
// 11.4). The frontend (client/src/pages/admin/QBankImportPage.tsx) parses
// CSV client-side and POSTs already-parsed row OBJECTS as JSON — these tests
// send `parsedRows`/`validRows` the same way, never raw CSV text.
//
// The core AC fixture below deliberately mirrors
// client/src/api/endpoints/admin.ts's bundled SAMPLE_BAD_CSV_TEXT sample's
// INTENT (a too-short stem, a missing-correct-marker, an unknown-subject,
// mixed with valid rows) rather than its exact literal text: the shipped
// sample's own "too-short stem" row text ("Bad row short stem") is actually
// 18 characters — NOT under the mock driver's own `< 10` threshold — so
// copying it verbatim would not actually exercise the stem-length rule this
// backend implements (the SAME rule, confirmed against
// client/src/api/endpoints/admin.ts's mock `dryRunCsvImport` branch). This
// fixture uses a stem that is genuinely < 10 characters so the "exactly 3
// flagged rows" acceptance criterion is meaningfully exercised.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession, createStudentSession } from '../helpers/adminSession.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';

const { sequelize, Question, Subject, BodySystem } = db;

afterAll(async () => {
  await sequelize.close();
});

let counter = 0;
function uniqueName(prefix) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/** Builds the 5-row fixture: 2 valid + 3 deliberately-bad rows (short stem, missing correct marker, unknown subject). */
function buildFixtureRows({ subjectName, systemName }) {
  return [
    {
      stem: 'A 50-year-old male presents with severe chest pain radiating to the left arm.',
      optionA: 'Aspirin',
      optionB: 'Metoprolol',
      optionC: 'Nitroglycerin',
      optionD: 'Morphine',
      correctOption: 'A',
      subjectName,
      systemName,
      difficulty: 'medium',
      explanation: 'Initial management for ACS involves antiplatelet therapy.',
    },
    {
      // Genuinely < 10 characters (the shipped SAMPLE_BAD_CSV_TEXT's own
      // "short stem" row is 18 chars and would NOT trigger this rule — see
      // file header).
      stem: 'Short',
      optionA: 'Opt A',
      optionB: 'Opt B',
      optionC: 'Opt C',
      optionD: 'Opt D',
      correctOption: 'A',
      subjectName,
      systemName,
      difficulty: 'easy',
      explanation: 'Stem is too short.',
    },
    {
      stem: 'A 30-year-old female with dyspnea and fever.',
      optionA: 'Ceftriaxone',
      optionB: 'Azithromycin',
      optionC: 'Amoxicillin',
      optionD: 'Vancomycin',
      correctOption: '',
      subjectName,
      systemName,
      difficulty: 'medium',
      explanation: 'Missing correct option marker.',
    },
    {
      stem: 'Patient with cardiac murmur on auscultation.',
      optionA: 'Echo',
      optionB: 'ECG',
      optionC: 'Xray',
      optionD: 'CT',
      correctOption: 'A',
      subjectName: 'Quantum Physics',
      systemName,
      difficulty: 'hard',
      explanation: 'Unknown subject not in active taxonomy.',
    },
    {
      stem: 'A 60-year-old diabetic patient with polyuria and polydipsia.',
      optionA: 'Metformin',
      optionB: 'Insulin',
      optionC: 'Glipizide',
      optionD: 'Empagliflozin',
      correctOption: 'A',
      subjectName,
      systemName,
      difficulty: 'easy',
      explanation: 'First-line therapy for type 2 diabetes.',
    },
  ];
}

describe('POST /api/v1/admin/questions/import/dry-run', () => {
  test('happy path / the AC: flags exactly the 3 deliberately-bad rows and no others', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('Medicine') });
    const system = await createBodySystem({ name: uniqueName('Cardiovascular System') });
    const rows = buildFixtureRows({ subjectName: subject.name, systemName: system.name });

    const res = await agent.post('/api/v1/admin/questions/import/dry-run').send({ parsedRows: rows });
    expect(res.status).toBe(200);
    expect(res.body.data.validCount).toBe(2);
    expect(res.body.data.errorCount).toBe(3);
    expect(res.body.data.validRows).toHaveLength(2);
    expect(res.body.data.errorRows).toHaveLength(3);

    const flaggedRowNumbers = res.body.data.errorRows.map((r) => r.rowNumber).sort((a, b) => a - b);
    expect(flaggedRowNumbers).toEqual([2, 3, 4]);

    const byRow = new Map(res.body.data.errorRows.map((r) => [r.rowNumber, r]));
    expect(byRow.get(2).reason).toMatch(/too short/i);
    expect(byRow.get(3).reason).toMatch(/correct answer/i);
    expect(byRow.get(4).reason).toMatch(/Unknown Subject/i);
    expect(byRow.get(4).reason).toContain('Quantum Physics');

    // Every errorRow carries a snippet + reason (task-mandated shape).
    for (const err of res.body.data.errorRows) {
      expect(typeof err.snippet).toBe('string');
      expect(typeof err.reason).toBe('string');
    }

    // valid rows are Question-shaped, not yet persisted.
    for (const row of res.body.data.validRows) {
      expect(row.subjectId).toBe(subject.id);
      expect(row.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(row.options.length).toBeGreaterThanOrEqual(2);
    }

    // Nothing written to the DB by dry-run.
    const questionCount = await Question.count({ where: { subjectId: subject.id } });
    expect(questionCount).toBe(0);
  });

  test('edge: systemName omitted falls back to a default body system rather than erroring', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('NoSystemSubject') });
    // Ensure at least one BodySystem row exists to serve as the fallback.
    await createBodySystem({ name: uniqueName('FallbackSystem') });

    const res = await agent.post('/api/v1/admin/questions/import/dry-run').send({
      parsedRows: [
        {
          stem: 'A patient presents with a fallback-system test vignette that is long enough.',
          optionA: 'A',
          optionB: 'B',
          correctOption: 'A',
          subjectName: subject.name,
          // systemName intentionally omitted.
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.validCount).toBe(1);
    expect(res.body.data.errorCount).toBe(0);
    const systemId = res.body.data.validRows[0].systemId;
    expect(typeof systemId).toBe('number');
    const resolvedSystem = await BodySystem.findByPk(systemId);
    expect(resolvedSystem).not.toBeNull();
  });

  test('validation failure: parsedRows not an array → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/questions/import/dry-run').send({ parsedRows: 'not-an-array' });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/questions/import/dry-run').send({ parsedRows: [] });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/questions/import/dry-run').send({ parsedRows: [] });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/questions/import/commit', () => {
  test('happy path / the AC: imports exactly the valid rows from a prior dry-run, round-tripped unchanged', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('CommitSubject') });
    const system = await createBodySystem({ name: uniqueName('CommitSystem') });
    const rows = buildFixtureRows({ subjectName: subject.name, systemName: system.name });

    const dryRun = await agent.post('/api/v1/admin/questions/import/dry-run').send({ parsedRows: rows });
    expect(dryRun.body.data.validRows).toHaveLength(2);

    const before = await Question.count({ where: { subjectId: subject.id } });
    const commit = await agent
      .post('/api/v1/admin/questions/import/commit')
      .send({ validRows: dryRun.body.data.validRows });
    expect(commit.status).toBe(200);
    expect(commit.body.data.importedCount).toBe(2);

    const after = await Question.count({ where: { subjectId: subject.id } });
    expect(after - before).toBe(2);
  });

  test('edge: re-validates from scratch — a row whose subject was deleted between dry-run and commit is skipped, not crashed', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject({ name: uniqueName('SoonDeletedSubject') });
    const system = await createBodySystem({ name: uniqueName('StillHereSystem') });

    const dryRun = await agent.post('/api/v1/admin/questions/import/dry-run').send({
      parsedRows: [
        {
          stem: 'A row whose subject will be deleted before commit runs, long enough stem.',
          optionA: 'A',
          optionB: 'B',
          correctOption: 'A',
          subjectName: subject.name,
          systemName: system.name,
        },
      ],
    });
    expect(dryRun.body.data.validCount).toBe(1);

    await Subject.destroy({ where: { id: subject.id } });

    const commit = await agent
      .post('/api/v1/admin/questions/import/commit')
      .send({ validRows: dryRun.body.data.validRows });
    expect(commit.status).toBe(200);
    expect(commit.body.data.importedCount).toBe(0);
  });

  test('validation failure: validRows not an array → 422', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.post('/api/v1/admin/questions/import/commit').send({ validRows: {} });
    expect(res.status).toBe(422);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).post('/api/v1/admin/questions/import/commit').send({ validRows: [] });
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.post('/api/v1/admin/questions/import/commit').send({ validRows: [] });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/questions/import-template', () => {
  test('happy path: downloadable CSV with the documented header + example rows', async () => {
    const { agent } = await createAdminSession(app);
    const res = await agent.get('/api/v1/admin/questions/import-template');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const firstLine = res.text.split('\n')[0].trim();
    expect(firstLine).toBe('stem,optionA,optionB,optionC,optionD,correctOption,subjectName,systemName,difficulty,explanation');
    expect(res.text.split('\n').filter((l) => l.trim().length > 0).length).toBeGreaterThanOrEqual(3);
  });

  test('auth failure: no session → 401', async () => {
    const res = await request(app).get('/api/v1/admin/questions/import-template');
    expect(res.status).toBe(401);
  });

  test('role failure: student session → 403', async () => {
    const { agent } = await createStudentSession(app);
    const res = await agent.get('/api/v1/admin/questions/import-template');
    expect(res.status).toBe(403);
  });
});
