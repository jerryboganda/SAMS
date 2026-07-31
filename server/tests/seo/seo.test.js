// server/tests/seo/seo.test.js
// robots.txt, sitemap.xml, and course-detail server meta-injection
// (docs/07_EXECUTION_PLAN.md 3.5).
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/models/index.js';
import { REPO_ROOT } from '../../src/config/env.js';
import { createCourse } from '../helpers/publicFixtures.js';

const { sequelize } = db;

afterAll(async () => {
  await sequelize.close();
});

describe('GET /robots.txt', () => {
  test('happy path: allows public site, disallows the auth-gated app areas + API, points Sitemap at /sitemap.xml', async () => {
    const res = await request(app).get('/robots.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/User-agent: \*/);
    expect(res.text).toMatch(/Allow: \//);
    // /app is the actual student-portal route prefix in client/src/App.tsx
    // (not /student — see DECISIONS.md 2026-07-31 Phase 3.5).
    expect(res.text).toMatch(/Disallow: \/admin/);
    expect(res.text).toMatch(/Disallow: \/app/);
    expect(res.text).toMatch(/Disallow: \/api\//);
    expect(res.text).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });
});

describe('GET /sitemap.xml', () => {
  test('happy path: correct XML content-type, lists static public routes + published course, excludes unpublished course', async () => {
    const published = await createCourse({ isPublished: true });
    const unpublished = await createCourse({ isPublished: false });

    const res = await request(app).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(res.text).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

    // Static public routes present.
    for (const p of ['<loc>', '/courses<', '/faculty<', '/faqs<', '/contact<', '/about<', '/terms<', '/privacy<', '/refund<']) {
      expect(res.text).toContain(p);
    }

    expect(res.text).toContain(`/courses/${published.slug}`);
    expect(res.text).not.toContain(`/courses/${unpublished.slug}`);
  });
});

// --- Course-detail meta injection ------------------------------------------
// This suite drives the real client/dist/index.html template through the
// full app, exactly like the other supertest specs — but the template only
// exists once `npm run build --prefix client` (or root `npm run build`) has
// run at least once. Mirrors the "don't crash on missing client/dist" spirit
// of server/src/app.js itself: skip gracefully with a clear log message
// instead of failing confusingly when nobody has built the client yet.
const CLIENT_INDEX_HTML = path.join(REPO_ROOT, 'client', 'dist', 'index.html');
const hasClientDist = fs.existsSync(CLIENT_INDEX_HTML);
const describeIfClientDist = hasClientDist ? describe : describe.skip;

if (!hasClientDist) {
  // eslint-disable-next-line no-console
  console.warn(
    '[seo.test.js] client/dist/index.html not found — skipping course-detail meta-injection tests. ' +
      'Run `npm run build --prefix client` (or root `npm run build`) first to exercise this suite.'
  );
}

describeIfClientDist('GET /courses/:slug (server meta-injection)', () => {
  test('published course: injects course-specific <title> + og:title/description/image/type', async () => {
    const course = await createCourse({
      isPublished: true,
      title: 'Unique SEO Test Course Title',
      shortDescription: 'A unique short description for SEO testing.',
      thumbnailUrl: 'https://example.test/seo-thumb.jpg',
    });

    const res = await request(app).get(`/courses/${course.slug}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain(`<title>${course.title} | SAMS Academy</title>`);
    expect(res.text).toContain(`<meta property="og:title" content="${course.title} | SAMS Academy" />`);
    expect(res.text).toContain(`<meta property="og:description" content="${course.shortDescription}" />`);
    expect(res.text).toContain(`<meta property="og:image" content="${course.thumbnailUrl}" />`);
    expect(res.text).toContain('<meta property="og:type" content="website" />');
  });

  test('unpublished course: falls through to the generic SPA shell (no crash, generic title, no leaked title)', async () => {
    const course = await createCourse({ isPublished: false, title: 'Should Never Appear In Meta' });

    const res = await request(app).get(`/courses/${course.slug}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>SAMS Academy | Medical Exam Preparation</title>');
    expect(res.text).not.toContain(course.title);
  });

  test('nonexistent slug: still 200s with the generic SPA shell, not a 404/crash (regression guard)', async () => {
    const res = await request(app).get('/courses/this-slug-does-not-exist-at-all-xyz');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>SAMS Academy | Medical Exam Preparation</title>');
    expect(res.text).toContain('<div id="root">');
  });

  test('regression: an unrelated random deep-link route still serves the generic SPA shell via the existing fallback', async () => {
    const res = await request(app).get('/some-random-page-that-does-not-exist');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });
});
