// server/src/app.js
// Express app: middleware chain (docs/02_ARCHITECTURE.md §3) + /api/v1
// routes + client/dist static serving w/ SPA fallback + 404 + errorHandler.
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import { env, REPO_ROOT } from './config/env.js';
import * as seoController from './controllers/seoController.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import v1Router from './routes/v1/index.js';
import seoRouter from './routes/seo.js';
import logger from './utils/logger.js';

const app = express();

// --- Middleware chain: helmet -> cors -> json -> cookies -> hpp -> rateLimit ---
app.use(helmet());
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(hpp());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// --- API routes -----------------------------------------------------------
app.use('/api/v1', v1Router);

// --- Uploaded assets (course thumbnails, question images, ...) -----------
// Served from storage/uploads/ under randomized filenames written by
// POST /admin/uploads/image (server/src/services/adminUploadService.js).
// `X-Content-Type-Options: nosniff` is already set globally by helmet()
// above (docs/10_SECURITY_CHECKLIST.md §G); express.static sets the
// Content-Type from the (sniffed-type-matched) file extension we control.
// The SPA fallback regex below already excludes `/uploads/*` from its catch-all.
app.use('/uploads', express.static(path.join(REPO_ROOT, 'storage', 'uploads')));

// --- Dev-only sample video asset (mock VideoProvider driver) --------------
// Serves storage/dev-assets/sample.mp4 so the `mock` VideoProvider driver
// (server/src/adapters/video/mock.js, docs/07_EXECUTION_PLAN.md 5.1) has a
// genuinely playable local URL with zero credentials, for local dev/tests/
// demos. This is purely a local test fixture path — NEVER used to serve or
// proxy the real Bunny CDN (that always goes through the signed token URLs
// built by server/src/adapters/video/bunny.js). Disabled outside dev/test so
// a production deploy never exposes it, regardless of VIDEO_PROVIDER.
if (env.NODE_ENV !== 'production') {
  app.use('/dev-assets', express.static(path.join(REPO_ROOT, 'storage', 'dev-assets')));
}

// --- SEO: robots.txt + sitemap.xml (docs/07_EXECUTION_PLAN.md 3.5) --------
// Always available regardless of client/dist presence — these are
// server-generated, not part of the SPA build.
app.use(seoRouter);

// --- Serve the built client SPA (client/dist), if it exists --------------
// Guarded: before the first `npm run build`, client/dist doesn't exist yet.
// Skip gracefully (warn, don't crash) rather than throwing on missing dir.
const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST, 'index.html');

if (fs.existsSync(CLIENT_DIST) && fs.existsSync(CLIENT_INDEX_HTML)) {
  // Vite emits content-hashed filenames under /assets — safe to cache hard.
  app.use(
    '/assets',
    express.static(path.join(CLIENT_DIST, 'assets'), {
      immutable: true,
      maxAge: '1y',
    })
  );
  // Everything else in dist (favicon, manifest, etc.) — short cache.
  app.use(express.static(CLIENT_DIST, { maxAge: '1h' }));

  // Course-detail SEO meta injection (docs/07_EXECUTION_PLAN.md 3.5) — must
  // be registered before the generic SPA fallback below so a published
  // course's request gets a course-specific <title>/og:* tags swap instead
  // of the generic index.html. Falls through (next()) to the SPA fallback
  // for invalid/unpublished/nonexistent slugs — not a special 404 case.
  app.get('/courses/:slug', seoController.courseDetailMeta);

  // SPA fallback for deep links (e.g. /courses) — but never for /api/*,
  // /uploads/*, or /dev-assets/*, which must fall through to the 404 handler
  // below if unmatched by their own routers.
  app.get(/^\/(?!api\/|uploads\/|dev-assets\/).*/, (req, res) => {
    res.sendFile(CLIENT_INDEX_HTML);
  });
} else {
  logger.warn('[app] client/dist not found — skipping static SPA serving (run `npm run build` first).');
}

// --- 404 + central error handler (must stay last) ------------------------
app.use(notFound);
app.use(errorHandler);

export default app;
