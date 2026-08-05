// server/src/app.js
// Express app: middleware chain (docs/02_ARCHITECTURE.md §3) + /api/v1
// routes + client/dist static serving w/ SPA fallback + 404 + errorHandler.
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
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

// --- Middleware chain: helmet -> compression -> cors -> json -> urlencoded -> cookies -> hpp -> rateLimit ---
//
// CSP (docs/10_SECURITY_CHECKLIST.md §A "helmet defaults + CSP on app/player
// pages (self + video CDN + inline-hash only)"). This is a single monolith
// SPA (Express serves client/dist with SPA fallback below) — there is no
// separate "player route" to scope a narrower policy to, so one global CSP
// covers both the app shell and the player page it renders client-side.
// Directive-by-directive reasoning (Phase 12.1):
//   - scriptSrc: 'self' only — client/index.html has a single
//     type="module" src="/src/main.tsx" (built to a hashed /assets/*.js file
//     by Vite) and no inline <script> tags, so no 'unsafe-inline'/nonce is
//     needed here.
//   - styleSrc: 'self' + 'unsafe-inline' — Tailwind's build emits a single
//     external stylesheet (also 'self'), but React sets a handful of inline
//     `style="..."` attributes at runtime (e.g. progress-bar widths, chart
//     colors) with no nonce/hash system in this codebase, so 'unsafe-inline'
//     is required for those to render. Also covers the Google Fonts
//     stylesheet's own internal @font-face rules once fetched.
//   - fontSrc / the Google Fonts links in client/index.html: 'self' +
//     fonts.googleapis.com (stylesheet) + fonts.gstatic.com (the actual font
//     files) — index.html <link>s these directly, unrelated to Bunny.
//   - imgSrc: 'self' + data: (the inline SVG favicon in index.html is a
//     data: URI) + https: (course thumbnails/question images are served
//     from our own /uploads under 'self', but admin-entered content — course
//     descriptions, faculty bios — may reference arbitrary external image
//     URLs; kept permissive here rather than breaking legitimate admin
//     content, since img-src alone can't execute script).
//   - mediaSrc: 'self' + https://*.b-cdn.net — Bunny's CDN pull-zone
//     hostname (BUNNY_CDN_HOSTNAME) serving direct HLS/MP4 URLs
//     (server/src/adapters/video/bunny.js buildHlsUrl).
//   - frameSrc: 'self' + https://iframe.mediadelivery.net — Bunny's iframe
//     embed URL (bunny.js buildIframeUrl / BUNNY_IFRAME_BASE), used when
//     BUNNY_CDN_HOSTNAME isn't configured.
//   - connectSrc: 'self' + https://*.b-cdn.net — the HLS player (hls.js)
//     fetches .m3u8/.ts segments directly via XHR/fetch from the CDN
//     pull-zone, which CSP treats as a "connect", not a "media" load.
//   - objectSrc: 'none' — no <object>/<embed> anywhere in the app.
//   - baseUri: 'self' — blocks a <base> tag hijack of relative URLs.
//   - frameAncestors: 'self' — this app is never meant to be framed by
//     another origin (equivalent to X-Frame-Options: SAMEORIGIN, which
//     helmet also sets by default).
// Verified against a real `npm run build --prefix client` output served
// through this exact app (NODE_ENV=production) — no CSP-violation console
// errors on the built homepage/course pages. See DECISIONS.md for the full
// verification note.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https://*.b-cdn.net'],
        frameSrc: ["'self'", 'https://iframe.mediadelivery.net'],
        connectSrc: ["'self'", 'https://*.b-cdn.net'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);
// Placed early (right after helmet, before body parsers) so every response —
// API JSON payloads and the static client/dist assets served further below —
// gets compressed, not just a subset of routes.
app.use(compression());
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
// A real hosted-checkout gateway (JazzCash/EasyPaisa/PayFast/Safepay, Phase
// 9.3+) POSTs its browser return AND its server-to-server IPN as
// application/x-www-form-urlencoded, not JSON — express.json() silently
// leaves req.body === {} for that content-type, which would make every
// PaymentGateway driver's handleCallback(req) see an empty body (found
// during Phase 9.3's JazzCash driver work; see DECISIONS.md). extended:true
// so a gateway that nests fields (none currently do) still parses.
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
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
