// server/src/utils/mailer.js
// nodemailer wrapper. When SMTP_HOST is empty (the dev/test default), mail is
// sent through nodemailer's built-in jsonTransport — no network I/O, never
// throws, so registration/reset/2FA/reverify flows work end-to-end with zero
// SMTP config. When SMTP_HOST is set, a real SMTP transport is used per
// docs/09_DEPLOYMENT_HOSTINGER.md's env vars.
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import logger from './logger.js';

function buildTransport() {
  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  // jsonTransport: builds the message, never actually connects/sends —
  // exactly the "log instead of send" behavior we want with zero SMTP config.
  return nodemailer.createTransport({ jsonTransport: true });
}

const transport = buildTransport();

/**
 * In-process outbox, populated only under NODE_ENV=test. Lets supertest
 * specs recover the raw one-time token/code embedded in an email's body
 * (the DB only ever stores a sha256 hash of it — see utils/crypto.js) without
 * resorting to ESM module-mock gymnastics for a handful of pure, deterministic
 * template functions. No effect outside tests: always defined (so imports
 * never fail), but never populated when NODE_ENV!=='test'.
 */
export const testOutbox = [];

/**
 * Sends (or, with no SMTP configured, logs) an email. Never throws — auth
 * flows must not fail just because mail delivery failed/is unconfigured.
 */
export async function sendMail({ to, subject, text, html }) {
  try {
    const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
    if (!env.SMTP_HOST) {
      logger.info(`[mailer] no SMTP configured — logging email instead of sending. to=${to} subject="${subject}"`);
      logger.debug(`[mailer] body: ${text}`);
    }
    if (env.NODE_ENV === 'test') {
      testOutbox.push({ to, subject, text, html });
    }
    return info;
  } catch (err) {
    logger.error(`[mailer] failed to send to=${to} subject="${subject}": ${err.message}`);
    return null;
  }
}

// --- Templates (plain text; minimal, functional per CLAUDE.md scope) -------

export function verifyEmailTemplate({ user, link }) {
  return {
    to: user.email,
    subject: 'Verify your SAMS Academy email address',
    text:
      `Hi ${user.name},\n\n` +
      `Please verify your email address to activate your SAMS Academy account:\n${link}\n\n` +
      `This link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
  };
}

export function passwordResetTemplate({ user, link }) {
  return {
    to: user.email,
    subject: 'Reset your SAMS Academy password',
    text:
      `Hi ${user.name},\n\n` +
      `We received a request to reset your password. Use the link below (valid for 1 hour):\n${link}\n\n` +
      `If you didn't request this, you can safely ignore this email — your password will not change.`,
  };
}

export function reverifyCodeTemplate({ user, code }) {
  return {
    to: user.email,
    subject: 'Confirm it’s you — SAMS Academy login verification',
    text:
      `Hi ${user.name},\n\n` +
      `We noticed a login attempt from an unrecognized device or location. ` +
      `Enter this 6-digit code to continue signing in:\n\n${code}\n\n` +
      `This code expires in ${15} minutes. If this wasn't you, change your password immediately.`,
  };
}

export function newDeviceAlertTemplate({ user, ip, deviceName }) {
  return {
    to: user.email,
    subject: 'New device signed in to your SAMS Academy account',
    text:
      `Hi ${user.name},\n\n` +
      `A new device (${deviceName || 'unknown device'}) from IP ${ip || 'unknown'} just signed in to your account.\n\n` +
      `If this was you, no action is needed. If not, reset your password immediately and contact support.`,
  };
}

export function contactMessageAdminAlertTemplate({ adminEmail, name, email, subject, message }) {
  return {
    to: adminEmail,
    subject: `[SAMS Academy] New contact message${subject ? `: ${subject}` : ''}`,
    text:
      `A new contact form submission was received.\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Subject: ${subject || '(none)'}\n\n` +
      `Message:\n${message}`,
  };
}

export function enrollmentExpiringReminderTemplate({ user, courseTitle, daysRemaining, expiryDateStr }) {
  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  return {
    to: user.email,
    subject: `Your access to "${courseTitle}" expires in ${daysRemaining} ${dayWord}`,
    text:
      `Hi ${user.name},\n\n` +
      `Your enrollment in "${courseTitle}" will expire in ${daysRemaining} ${dayWord}, on ${expiryDateStr}.\n\n` +
      `Renew your access from your Orders page before it expires to keep watching course videos and using the QBank.`,
  };
}

export function passwordChangedTemplate({ user }) {
  return {
    to: user.email,
    subject: 'Your SAMS Academy password was changed',
    text:
      `Hi ${user.name},\n\n` +
      `Your password was just changed. All other active sessions have been signed out for your security.\n\n` +
      `If you didn't make this change, contact support immediately.`,
  };
}

export default sendMail;
