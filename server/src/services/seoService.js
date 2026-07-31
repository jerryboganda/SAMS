// server/src/services/seoService.js
// Business logic for robots.txt, sitemap.xml, and the course-detail
// server-rendered <head> meta injection (docs/07_EXECUTION_PLAN.md 3.5;
// docs/05_FRONTEND_SPEC.md §SEO: "server injects meta for /courses/:slug —
// simple template swap in index.html render"). Layering: routes ->
// controllers -> services -> models (CLAUDE.md §4).
import { env } from '../config/env.js';
import db from '../models/index.js';

const { Course } = db;

// Static, always-indexable public marketing routes — verified against the
// actual <Route> tree in client/src/App.tsx (read-only, per task scope)
// rather than guessed. Legal pages use their canonical single-purpose paths
// (/terms, /privacy, /refund); /refund-policy is a duplicate alias for the
// same LegalPage component (client/src/pages/public/LegalPage.tsx) and is
// intentionally excluded to avoid duplicate-content sitemap entries — see
// DECISIONS.md 2026-07-31 (Phase 3.5) entry.
//
// /qbank, /free-trial, /faculty/:id, /checkout(/:slug), /order/:id/status
// are deliberately NOT included: they're either transactional (checkout/
// order-status), auth-adjacent, or per-entity detail pages outside this
// task's explicit "home, courses list, faculty, faqs, contact, about, the 3
// legal pages" list.
export const STATIC_PUBLIC_ROUTES = ['/', '/courses', '/faculty', '/faqs', '/contact', '/about', '/terms', '/privacy', '/refund'];

function absoluteUrl(pathname) {
  return new URL(pathname, env.APP_URL).toString();
}

// ---------------------------------------------------------------------------
// GET /robots.txt
// ---------------------------------------------------------------------------

export function generateRobotsTxt() {
  // Disallowed paths deliberately match the *actual* auth-gated app route
  // prefixes from client/src/App.tsx (/admin, /app — the student portal is
  // mounted at /app, not /student; see DECISIONS.md 2026-07-31 Phase 3.5 for
  // this deviation from the task's illustrative /student example) plus the
  // JSON API itself, which has nothing for a crawler to render.
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /app', 'Disallow: /api/', '', `Sitemap: ${absoluteUrl('/sitemap.xml')}`];
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// GET /sitemap.xml
// ---------------------------------------------------------------------------

function xmlEscape(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

export async function generateSitemapXml() {
  const courses = await Course.findAll({
    where: { isPublished: true },
    attributes: ['slug', 'updatedAt'],
    order: [['id', 'ASC']],
  });

  const staticUrls = STATIC_PUBLIC_ROUTES.map((p) => ({ loc: absoluteUrl(p) }));
  const courseUrls = courses.map((c) => ({ loc: absoluteUrl(`/courses/${c.slug}`), lastmod: c.updatedAt }));

  const urlEntries = [...staticUrls, ...courseUrls]
    .map(({ loc, lastmod }) => {
      const lastmodTag = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${xmlEscape(loc)}</loc>${lastmodTag}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// Course-detail meta injection (GET /courses/:slug, server.js-level, not
// under /api/v1 — see server/src/app.js)
// ---------------------------------------------------------------------------

// Looks up a published course by slug for meta purposes only — reuses the
// exact same `{ slug, isPublished: true }` filter as
// publicService.getCourseBySlug so an unpublished course's existence is
// never revealed via meta tags either (mirrors the API's 404 behavior: a
// miss here just means "fall through to the generic shell").
export async function getCourseMetaBySlug(slug) {
  const course = await Course.findOne({
    where: { slug, isPublished: true },
    attributes: ['title', 'shortDescription', 'thumbnailUrl'],
  });
  if (!course) return null;
  return {
    title: `${course.title} | SAMS Academy`,
    description: course.shortDescription || '',
    image: course.thumbnailUrl || '',
  };
}

// Replaces <title> and adds/replaces the og:* tags in a raw index.html
// template string. Follows the same tag conventions already present in
// client/index.html (double-quoted attributes, one tag per line) rather
// than introducing a different style.
export function injectMetaIntoHtml(html, meta) {
  let out = html.replace(/<title>.*?<\/title>/i, `<title>${xmlEscape(meta.title)}</title>`);

  // Strip any pre-existing og:* tags first (none exist in the current
  // template, but keeps this idempotent if the template ever gains its own
  // static defaults) before inserting the course-specific set.
  out = out.replace(/\s*<meta property="og:[^"]+"[^>]*\/?>/gi, '');

  const ogTags = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${xmlEscape(meta.title)}" />`,
    `<meta property="og:description" content="${xmlEscape(meta.description)}" />`,
    ...(meta.image ? [`<meta property="og:image" content="${xmlEscape(meta.image)}" />`] : []),
  ].join('\n    ');

  out = out.replace('</head>', `    ${ogTags}\n  </head>`);
  return out;
}
