// server/src/controllers/seoController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/seoService.js.
//
// NOTE: robots.txt/sitemap.xml/course-detail-meta are NOT /api/v1 JSON
// endpoints — they're root-level, non-envelope responses (plain text / XML /
// HTML), so they intentionally skip the `{success,data}` envelope used by
// controllers/*.js elsewhere. They're still wired routes -> controllers ->
// services -> models like everything else.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { REPO_ROOT } from '../config/env.js';
import * as seoService from '../services/seoService.js';

const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST, 'index.html');

// In-memory cache of the raw client/dist/index.html template, populated
// lazily on the first course-detail request rather than re-read from disk on
// every hit. Documented tradeoff (docs/07_EXECUTION_PLAN.md 3.5 /
// DECISIONS.md 2026-07-31): a `client` rebuild (e.g. redeploy) requires an
// app restart to pick up the new template — there is no file-watch/mtime
// invalidation. Acceptable at this project's scale (single Node process,
// deploys already require a restart to pick up new server code) and
// consistent with how server/src/app.js itself resolves CLIENT_DIST/
// CLIENT_INDEX_HTML once at module-load time rather than per-request.
let cachedTemplate = null;

function getIndexHtmlTemplate() {
  if (cachedTemplate !== null) return cachedTemplate;
  if (!fs.existsSync(CLIENT_INDEX_HTML)) return null;
  cachedTemplate = fs.readFileSync(CLIENT_INDEX_HTML, 'utf8');
  return cachedTemplate;
}

const slugParamSchema = z.string().trim().min(1).max(190);

// --- Handlers ------------------------------------------------------------

export const robotsTxt = asyncHandler(async (req, res) => {
  res.type('text/plain').send(seoService.generateRobotsTxt());
});

export const sitemapXml = asyncHandler(async (req, res) => {
  const xml = await seoService.generateSitemapXml();
  res.type('application/xml').send(xml);
});

// Mounted in app.js BEFORE the generic SPA fallback, and only registered
// when client/dist exists (mirrors app.js's own dist-existence guard).
// Looks up the course by slug; on a hit, serves index.html with
// course-specific <title>/og:* tags swapped in. On a miss (invalid slug,
// unpublished course, or nonexistent slug) calls next() so control falls
// through to the normal SPA fallback — deliberately NOT a special 404 case
// (docs/07_EXECUTION_PLAN.md 3.5 acceptance criteria).
//
// Slug is zod-validated per CLAUDE.md §4 ("zod on every input"), but unlike
// JSON API controllers a validation failure here does not throw a 422 —
// this route renders HTML, not the API envelope, so an invalid slug is
// simply treated the same as "not found" and falls through.
export const courseDetailMeta = asyncHandler(async (req, res, next) => {
  const template = getIndexHtmlTemplate();
  if (!template) return next();

  const parsed = slugParamSchema.safeParse(req.params.slug);
  if (!parsed.success) return next();

  const meta = await seoService.getCourseMetaBySlug(parsed.data);
  if (!meta) return next();

  res.type('html').send(seoService.injectMetaIntoHtml(template, meta));
});
