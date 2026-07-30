// server/src/routes/v1/index.js
// Mounts every /api/v1/* sub-router. Later phases add auth.js, courses.js,
// qbank.js, etc. here per docs/04_API_SPEC.md.
import { Router } from 'express';
import health from './health.js';

const router = Router();

router.use('/health', health);

export default router;
