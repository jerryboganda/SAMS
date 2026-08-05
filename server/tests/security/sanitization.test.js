// server/tests/security/sanitization.test.js
// docs/07_EXECUTION_PLAN.md Phase 12.2 — "Sanitization: rich-text fields
// (stems/explanations/announcements/descriptions) whitelisted
// (sanitize-html) at write; escape at render." Acceptance criteria:
// "stored-XSS payload fixture neutralized end-to-end."
//
// Cross-references docs/10_SECURITY_CHECKLIST.md §G: "Rich text sanitized on
// write (whitelist) + escaped on render; stored-XSS test passes".
//
// For every admin/public WRITE path that persists freeform text, this file:
//   1. POSTs a real XSS payload fixture through the real HTTP route.
//   2. GETs the created resource back (proving persistence + round-trip, not
//      just that the service function was called with sanitized input).
//   3. Asserts the SPECIFIC dangerous substring (`<script`, `onerror=`) is
//      absent from the stored+returned value — not merely that "some"
//      sanitization happened.
//   4. At least one test per rich-text field also proves a LEGITIMATE
//      whitelisted tag (`<b>bold text</b>`) survives intact end-to-end —
//      proving the sanitizer is a whitelist, not an accidental strip-all.
//
// See server/src/utils/sanitize.js for the shared sanitizeRichText/
// sanitizePlainText utility every service below routes through.
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { createAdminSession } from '../helpers/adminSession.js';
import { createSubject, createBodySystem } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

// --- Shared XSS payload fixtures -------------------------------------------
const SCRIPT_PAYLOAD = '<script>alert(1)</script>';
const IMG_PAYLOAD = '<img src=x onerror=alert(1)>';

function expectNeutralized(value) {
  expect(value).toEqual(expect.any(String));
  expect(value.toLowerCase()).not.toContain('<script');
  expect(value.toLowerCase()).not.toContain('onerror=');
  expect(value.toLowerCase()).not.toContain('<img');
}

// ---------------------------------------------------------------------------
// 1. Admin questions — stem/explanation/referenceText/option.optionText
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/admin/questions (stem/explanation/referenceText/options)', () => {
  test('stored-XSS fixture: script + img/onerror payloads across every text field are neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();

    const res = await agent.post('/api/v1/admin/questions').send({
      examCategory: 'NRE1',
      subjectId: subject.id,
      systemId: system.id,
      stem: `A patient presents with chest pain. ${SCRIPT_PAYLOAD}`,
      explanation: `The correct answer is X because Y. ${IMG_PAYLOAD}`,
      referenceText: `Robbins Pathology ${SCRIPT_PAYLOAD} p.234`,
      difficulty: 'medium',
      options: [
        { optionText: `Option A ${SCRIPT_PAYLOAD}`, isCorrect: true, sortOrder: 0 },
        { optionText: `Option B ${IMG_PAYLOAD}`, isCorrect: false, sortOrder: 1 },
      ],
    });
    expect(res.status).toBe(201);

    // Assert directly on the create response (written value)...
    expectNeutralized(res.body.data.stem);
    expectNeutralized(res.body.data.explanation);
    expectNeutralized(res.body.data.referenceText);
    for (const opt of res.body.data.options) expectNeutralized(opt.optionText);
    // ...and legitimate surrounding text is preserved (not a strip-everything bug).
    expect(res.body.data.stem).toContain('A patient presents with chest pain.');
    expect(res.body.data.options.find((o) => o.isCorrect).optionText).toContain('Option A');

    // ...then re-fetch via GET to prove it's the persisted+returned value, not just the create echo.
    const getRes = await agent.get('/api/v1/admin/questions');
    const stored = getRes.body.data.find((q) => q.id === res.body.data.id);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.stem);
    expectNeutralized(stored.explanation);
    expectNeutralized(stored.referenceText);
    for (const opt of stored.options) expectNeutralized(opt.optionText);
  });

  test('legitimate whitelist tag: <b>bold text</b> in explanation survives the rich-text whitelist intact', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();

    const res = await agent.post('/api/v1/admin/questions').send({
      examCategory: 'NRE1',
      subjectId: subject.id,
      systemId: system.id,
      stem: 'Plain stem text, no markup expected here.',
      explanation: 'This is <b>bold text</b> and <em>emphasis</em> in the explanation.',
      difficulty: 'medium',
      options: [
        { optionText: 'Option A', isCorrect: true, sortOrder: 0 },
        { optionText: 'Option B', isCorrect: false, sortOrder: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.explanation).toBe('This is <b>bold text</b> and <em>emphasis</em> in the explanation.');
    // Stem is plain-text-only — a legitimate <b> typed there is stripped down to its text content.
    // (Not asserted here since the happy-path stem above never contained markup.)
  });

  test('PATCH /api/v1/admin/questions/:id also sanitizes updated fields', async () => {
    const { agent } = await createAdminSession(app);
    const subject = await createSubject();
    const system = await createBodySystem();
    const created = await agent.post('/api/v1/admin/questions').send({
      examCategory: 'NRE1',
      subjectId: subject.id,
      systemId: system.id,
      stem: 'Original stem.',
      explanation: 'Original explanation.',
      difficulty: 'medium',
      options: [
        { optionText: 'Option A', isCorrect: true, sortOrder: 0 },
        { optionText: 'Option B', isCorrect: false, sortOrder: 1 },
      ],
    });

    const patched = await agent.patch(`/api/v1/admin/questions/${created.body.data.id}`).send({
      stem: `Updated stem ${SCRIPT_PAYLOAD}`,
    });
    expect(patched.status).toBe(200);
    expectNeutralized(patched.body.data.stem);
    expect(patched.body.data.stem).toContain('Updated stem');
  });
});

// ---------------------------------------------------------------------------
// 2. Admin announcements — title/body
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/admin/announcements (title/body)', () => {
  test('stored-XSS fixture: script + img/onerror payloads in title/body are neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: `Important update ${SCRIPT_PAYLOAD}`,
      body: `Please read this announcement. ${IMG_PAYLOAD} Thanks.`,
      audience: 'all',
    });
    expect(res.status).toBe(201);
    expectNeutralized(res.body.data.title);
    expectNeutralized(res.body.data.body);
    expect(res.body.data.title).toContain('Important update');
    expect(res.body.data.body).toContain('Please read this announcement.');

    const getRes = await agent.get('/api/v1/admin/announcements');
    const stored = getRes.body.data.find((a) => a.id === res.body.data.id);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.title);
    expectNeutralized(stored.body);
  });

  test('legitimate whitelist tag: <b>bold text</b> in the announcement body survives intact', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/announcements').send({
      title: 'Plain title, no markup expected here.',
      body: 'We are excited to announce <b>bold text</b> for this course update.',
      audience: 'all',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe('We are excited to announce <b>bold text</b> for this course update.');

    const getRes = await agent.get('/api/v1/admin/announcements');
    const stored = getRes.body.data.find((a) => a.id === res.body.data.id);
    expect(stored.body).toBe('We are excited to announce <b>bold text</b> for this course update.');
  });
});

// ---------------------------------------------------------------------------
// 3. Admin courses & lectures — title/shortDescription/description
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/admin/courses (title/shortDescription/description) + lectures', () => {
  function courseSlug() {
    return `xss-course-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  test('stored-XSS fixture: script + img/onerror payloads in course fields are neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/courses').send({
      title: `NRE1 Prep Course ${SCRIPT_PAYLOAD}`,
      slug: courseSlug(),
      examCategory: 'NRE1',
      shortDescription: `A short blurb. ${IMG_PAYLOAD}`,
      description: `A full description. ${SCRIPT_PAYLOAD} More text.`,
    });
    expect(res.status).toBe(201);
    expectNeutralized(res.body.data.title);
    expectNeutralized(res.body.data.shortDescription);
    expectNeutralized(res.body.data.description);
    expect(res.body.data.title).toContain('NRE1 Prep Course');

    const getRes = await agent.get(`/api/v1/admin/courses/${res.body.data.id}`);
    expect(getRes.status).toBe(200);
    expectNeutralized(getRes.body.data.title);
    expectNeutralized(getRes.body.data.shortDescription);
    expectNeutralized(getRes.body.data.description);
  });

  test('legitimate whitelist tag: <b>bold text</b> in course description survives intact', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/courses').send({
      title: 'Plain course title',
      slug: courseSlug(),
      examCategory: 'NRE1',
      description: 'This course covers <b>bold text</b> topics in depth.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.description).toBe('This course covers <b>bold text</b> topics in depth.');
  });

  test('stored-XSS fixture: script payload in lecture title/description is neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);

    const courseRes = await agent.post('/api/v1/admin/courses').send({
      title: 'Lecture XSS Test Course',
      slug: courseSlug(),
      examCategory: 'NRE1',
    });
    const sectionRes = await agent.post(`/api/v1/admin/courses/${courseRes.body.data.id}/sections`).send({
      title: 'Section 1',
    });
    const lectureRes = await agent
      .post(`/api/v1/admin/sections/${sectionRes.body.data.id}/lectures`)
      .send({
        title: `Lecture One ${SCRIPT_PAYLOAD}`,
        description: `Lecture description. ${IMG_PAYLOAD}`,
        videoProvider: 'mock',
      });
    expect(lectureRes.status).toBe(201);
    expectNeutralized(lectureRes.body.data.title);
    expectNeutralized(lectureRes.body.data.description);
    expect(lectureRes.body.data.title).toContain('Lecture One');

    const listRes = await agent.get(`/api/v1/admin/sections/${sectionRes.body.data.id}/lectures`);
    const stored = listRes.body.data.find((l) => l.id === lectureRes.body.data.id);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.title);
    expectNeutralized(stored.description);
  });
});

// ---------------------------------------------------------------------------
// 4. Admin faculty — name/title/bio
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/admin/faculty (name/title/bio)', () => {
  test('stored-XSS fixture: script + img/onerror payloads are neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);

    // isActive:false — this file only exercises the admin GET (which returns
    // every row regardless of isActive); keeping it inactive avoids leaking
    // into GET /api/v1/public/faculty's active-only, sortOrder-ordered result
    // set and colliding with tests/public/facultyFaqs.test.js's own
    // positional (`data[0]`) assertion when run in the same full-suite pass.
    const res = await agent.post('/api/v1/admin/faculty').send({
      name: `Dr. Test ${SCRIPT_PAYLOAD}`,
      title: `Senior Instructor ${IMG_PAYLOAD}`,
      bio: `Experienced educator. ${SCRIPT_PAYLOAD} MBBS, FCPS.`,
      isActive: false,
    });
    expect(res.status).toBe(201);
    expectNeutralized(res.body.data.name);
    expectNeutralized(res.body.data.title);
    expectNeutralized(res.body.data.bio);
    expect(res.body.data.name).toContain('Dr. Test');

    const getRes = await agent.get('/api/v1/admin/faculty');
    const stored = getRes.body.data.find((f) => f.id === res.body.data.id);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.name);
    expectNeutralized(stored.bio);
  });

  test('legitimate whitelist tag: <b>bold text</b> in faculty bio survives intact', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/faculty').send({
      name: 'Dr. Legit Name',
      bio: 'MBBS, <b>bold text</b> FCPS Medicine.',
      isActive: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.bio).toBe('MBBS, <b>bold text</b> FCPS Medicine.');
  });
});

// ---------------------------------------------------------------------------
// 5. Admin FAQs — question/answer
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/admin/faqs (question/answer)', () => {
  test('stored-XSS fixture: script + img/onerror payloads are neutralized end-to-end', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/faqs').send({
      question: `Is this course accredited? ${SCRIPT_PAYLOAD}`,
      answer: `Yes, it is fully accredited. ${IMG_PAYLOAD}`,
    });
    expect(res.status).toBe(201);
    expectNeutralized(res.body.data.question);
    expectNeutralized(res.body.data.answer);
    expect(res.body.data.question).toContain('Is this course accredited?');

    const getRes = await agent.get('/api/v1/admin/faqs');
    const stored = getRes.body.data.find((f) => f.id === res.body.data.id);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.question);
    expectNeutralized(stored.answer);
  });

  test('legitimate whitelist tag: <b>bold text</b> in FAQ answer survives intact', async () => {
    const { agent } = await createAdminSession(app);

    const res = await agent.post('/api/v1/admin/faqs').send({
      question: 'Plain question, no markup expected here?',
      answer: 'Yes — <b>bold text</b> is definitely included.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.answer).toBe('Yes — <b>bold text</b> is definitely included.');
  });
});

// ---------------------------------------------------------------------------
// 6. Public contact form — name/subject/message (PUBLIC, untrusted-by-default)
// ---------------------------------------------------------------------------

describe('Sanitization: POST /api/v1/public/contact (name/subject/message, anonymous visitor input)', () => {
  test('stored-XSS fixture: script + img/onerror payloads are neutralized end-to-end, visible in the admin Contact Inbox', async () => {
    const { agent } = await createAdminSession(app);

    const payload = {
      name: `Anonymous Visitor ${SCRIPT_PAYLOAD}`,
      email: 'xss-tester@example.test',
      subject: `Question ${IMG_PAYLOAD}`,
      message: `I have a question about enrollment. ${SCRIPT_PAYLOAD} Please advise.`,
    };
    const res = await request(app).post('/api/v1/public/contact').send(payload);
    expect(res.status).toBe(201);

    // Read back through the admin Contact Inbox — the actual render surface for this data.
    const listRes = await agent.get('/api/v1/admin/messages');
    expect(listRes.status).toBe(200);
    const stored = listRes.body.data.find((m) => m.email === payload.email);
    expect(stored).toBeTruthy();
    expectNeutralized(stored.name);
    expectNeutralized(stored.subject);
    expectNeutralized(stored.message);
    expect(stored.name).toContain('Anonymous Visitor');
    expect(stored.message).toContain('I have a question about enrollment.');
  });
});
