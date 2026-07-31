// server/src/routes/v1/auth.js
// Mounts every /api/v1/auth/* endpoint per docs/04_API_SPEC.md §1.
// Layering: routes -> controllers -> services -> models (CLAUDE.md §4).
import { Router } from 'express';
import * as authController from '../../controllers/authController.js';
import { auth } from '../../middleware/auth.js';
import { deviceCheck } from '../../middleware/deviceCheck.js';
import { audit } from '../../middleware/audit.js';
import { authLimiter, resendVerificationLimiter, resendVerificationIpLimiter } from '../../middleware/rateLimits.js';

const router = Router();

// --- Public (P) --------------------------------------------------------
router.post('/register', authLimiter, authController.register);
router.post('/verify-email', authLimiter, authController.verifyEmail);
router.post(
  '/resend-verification',
  resendVerificationIpLimiter,
  resendVerificationLimiter,
  authController.resendVerification
);
router.post('/login', authLimiter, authController.login);
router.post('/reverify', authLimiter, authController.reverify);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// --- Authenticated (S/A) ----------------------------------------------
// `logout` deliberately skips deviceCheck: it must still be able to revoke
// the refresh token / clear cookies even if the device row was reset by an
// admin (deviceCheck would otherwise 401 before the user can ever clear
// their own session).
router.post('/logout', auth, authController.logout);
router.post('/logout-all', auth, deviceCheck, audit('user.logout_all', 'user'), authController.logoutAll);

router.get('/me', auth, deviceCheck, authController.getMe);
router.patch('/me', auth, deviceCheck, authController.updateMe);
router.post('/change-password', auth, deviceCheck, authController.changePassword);
router.get('/devices', auth, deviceCheck, authController.listDevices);

router.post('/2fa/setup', auth, deviceCheck, authController.setup2fa);
router.post('/2fa/enable', auth, deviceCheck, authController.enable2fa);
router.post('/2fa/disable', auth, deviceCheck, audit('user.2fa_disable', 'user'), authController.disable2fa);

export default router;
