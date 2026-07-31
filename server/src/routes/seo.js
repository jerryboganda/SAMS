// server/src/routes/seo.js
// Root-level (non-/api/v1) SEO routes: robots.txt + sitemap.xml
// (docs/07_EXECUTION_PLAN.md 3.5). Mounted directly on the app in app.js,
// alongside — not inside — the /api/v1 router, since these aren't JSON API
// endpoints. The course-detail meta-injection route lives in app.js itself
// (not here) because it must be registered before the SPA catch-all and only
// when client/dist exists, mirroring app.js's own existing dist-guard.
import { Router } from 'express';
import * as seoController from '../controllers/seoController.js';

const router = Router();

router.get('/robots.txt', seoController.robotsTxt);
router.get('/sitemap.xml', seoController.sitemapXml);

export default router;
