// server/src/routes/v1/packages.js
// Public routes for subscription packages
import { Router } from 'express';
import * as adminPackageController from '../../controllers/adminPackageController.js';

const router = Router();

router.get('/', adminPackageController.listPublicPackages);
router.get('/packages', adminPackageController.listPublicPackages);

export default router;
