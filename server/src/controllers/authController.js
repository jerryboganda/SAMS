// server/src/controllers/authController.js
// Thin per docs/02_ARCHITECTURE.md: validate(zod) -> service -> respond.
// No SQL/ORM calls live here — see services/authService.js and
// services/twofaService.js for the actual business logic.
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { ApiError } from '../utils/apiError.js';
import * as authService from '../services/authService.js';
import * as twofaService from '../services/twofaService.js';
import { listDevicesForUser } from '../services/deviceService.js';
import db from '../models/index.js';

const { User } = db;

const emailField = z.string().trim().toLowerCase().email().max(190);
const passwordField = z.string().min(8, 'Password must be at least 8 characters.').max(72);

// --- Schemas -----------------------------------------------------------

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailField,
  phone: z.string().trim().max(30).optional(),
  password: passwordField,
});

const verifyEmailSchema = z.object({ token: z.string().min(1) });
const resendVerificationSchema = z.object({ email: emailField });

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
  twofaCode: z.string().trim().min(1).max(20).optional(),
});

const reverifySchema = z.object({ email: emailField, code: z.string().trim().min(1).max(20) });

const forgotPasswordSchema = z.object({ email: emailField });
const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: passwordField });

const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.phone !== undefined, {
    message: 'At least one of name or phone must be provided.',
  });

const changePasswordSchema = z.object({ current: z.string().min(1), new: passwordField });

const enable2faSchema = z.object({ code: z.string().trim().min(6).max(10) });
const disable2faSchema = z
  .object({
    code: z.string().trim().min(6).max(10).optional(),
    backupCode: z.string().trim().min(6).max(12).optional(),
  })
  .refine((data) => Boolean(data.code || data.backupCode), {
    message: 'Provide either code or backupCode.',
  });

// --- Helpers -------------------------------------------------------------

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

async function requireUser(req) {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Session invalid.');
  return user;
}

// --- 2.1 Register / verify -------------------------------------------------

export const register = asyncHandler(async (req, res) => {
  const body = validateBody(registerSchema, req.body);
  await authService.register(body);
  ok(res, { message: 'Registration successful! Please check your email for the verification link.' }, 201);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = validateBody(verifyEmailSchema, req.body);
  await authService.verifyEmail(token);
  ok(res, { success: true, message: 'Email address verified successfully!' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = validateBody(resendVerificationSchema, req.body);
  await authService.resendVerification(email);
  ok(res, { message: 'If a pending account exists for this email, a new verification link has been sent.' });
});

// --- 2.2 / 2.4 Login core + reverify ---------------------------------------

export const login = asyncHandler(async (req, res) => {
  const body = validateBody(loginSchema, req.body);
  const result = await authService.login(body, req, res);
  ok(res, result);
});

export const reverify = asyncHandler(async (req, res) => {
  const body = validateBody(reverifySchema, req.body);
  const result = await authService.reverifyLogin(body, req, res);
  ok(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshSession(req, res);
  ok(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req, res);
  ok(res, { success: true });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.id, res);
  ok(res, { success: true });
});

// --- Forgot / reset password -------------------------------------------

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = validateBody(forgotPasswordSchema, req.body);
  await authService.forgotPassword(email);
  ok(res, { message: `If an account exists for ${email}, password reset instructions have been sent.` });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const body = validateBody(resetPasswordSchema, req.body);
  await authService.resetPassword(body);
  ok(res, { message: 'Password reset successful. You may now log in with your new password.' });
});

// --- 2.5 Session mgmt --------------------------------------------------

export const getMe = asyncHandler(async (req, res) => {
  const data = await authService.getMe(req.user.id);
  ok(res, data);
});

export const updateMe = asyncHandler(async (req, res) => {
  const body = validateBody(updateMeSchema, req.body);
  const data = await authService.updateMe(req.user.id, body);
  ok(res, data);
});

export const changePassword = asyncHandler(async (req, res) => {
  const body = validateBody(changePasswordSchema, req.body);
  await authService.changePassword(req.user.id, body, req);
  ok(res, { message: 'Password changed. Other active sessions have been signed out.' });
});

export const listDevices = asyncHandler(async (req, res) => {
  const data = await listDevicesForUser(req.user.id, req);
  ok(res, data);
});

// --- 2.6 TOTP 2FA --------------------------------------------------------

export const setup2fa = asyncHandler(async (req, res) => {
  const user = await requireUser(req);
  const data = await twofaService.setupTwofa(user);
  ok(res, data);
});

export const enable2fa = asyncHandler(async (req, res) => {
  const { code } = validateBody(enable2faSchema, req.body);
  const user = await requireUser(req);
  const data = await twofaService.enableTwofa(user, code);
  ok(res, data);
});

export const disable2fa = asyncHandler(async (req, res) => {
  const body = validateBody(disable2faSchema, req.body);
  const user = await requireUser(req);
  await twofaService.disableTwofa(user, body);
  ok(res, { success: true });
});
