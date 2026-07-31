// server/src/routes/v1/public.js
// Mounts every /api/v1/public/* endpoint per docs/04_API_SPEC.md §2.
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
// All routes here are role P (public) — no auth/deviceCheck/audit middleware.
import { Router } from 'express';
import * as publicController from '../../controllers/publicController.js';
import { contactLimiter } from '../../middleware/rateLimits.js';

const router = Router();

router.get('/home', publicController.getHome);
router.get('/courses', publicController.listCourses);
router.get('/courses/:slug', publicController.getCourseBySlug);
router.get('/faculty', publicController.listFaculty);
router.get('/faqs', publicController.listFaqs);
router.get('/pages/:key', publicController.getPage);
router.post('/contact', contactLimiter, publicController.submitContact);
router.get('/sample-questions', publicController.getSampleQuestions);

export default router;
