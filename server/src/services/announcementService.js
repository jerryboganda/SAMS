// server/src/services/announcementService.js
// Phase 10.2 — student-facing announcement listing (GET /announcements) and
// the admin composer/broadcast flow (GET/POST /admin/announcements, DELETE
// /admin/announcements/:id). Layering: routes -> controllers -> services ->
// models (CLAUDE.md §4).
//
// `listAnnouncementsForStudent` deliberately does NOT import from or share
// code with services/studentDashboardService.js's own private
// `loadAnnouncements()` (that function stays untouched — Phase 6 code, out
// of scope here). Same query shape (audience='all' OR audience='course' with
// courseId in the caller's enrolled course ids), but this is its own
// top-level endpoint: no 5-item cap, no query-budget constraint. A small
// amount of duplication between the two is an accepted tradeoff already
// decided by the orchestrator.
import { Op } from 'sequelize';
import db from '../models/index.js';
import logger from '../utils/logger.js';
import { sendMail } from '../utils/mailer.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizePlainText, sanitizeRichText } from '../utils/sanitize.js';

const { Announcement, Course, User, Enrollment, Notification } = db;

const ANNOUNCEMENT_INCLUDES = [
  { model: Course, as: 'course', attributes: ['id', 'title'] },
  { model: User, as: 'creator', attributes: ['id', 'name'] },
];

// Matches client/src/types/index.ts's `Announcement` interface exactly.
function serializeAnnouncement(a) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience,
    courseId: a.courseId ?? undefined,
    courseTitle: a.course ? a.course.title : undefined,
    sendEmail: a.sendEmail,
    createdBy: a.creator ? a.creator.name : undefined,
    createdAt: a.createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET /announcements (student)
// ---------------------------------------------------------------------------

export async function listAnnouncementsForStudent(userId) {
  const enrollments = await Enrollment.findAll({ where: { userId }, attributes: ['courseId'] });
  const enrolledCourseIds = [...new Set(enrollments.map((e) => Number(e.courseId)))];

  const announcements = await Announcement.findAll({
    where: {
      [Op.or]: [{ audience: 'all' }, { audience: 'course', courseId: enrolledCourseIds.length ? enrolledCourseIds : [-1] }],
    },
    order: [['createdAt', 'DESC']],
    limit: 100,
    include: ANNOUNCEMENT_INCLUDES,
  });
  return announcements.map(serializeAnnouncement);
}

// ---------------------------------------------------------------------------
// GET /admin/announcements
// ---------------------------------------------------------------------------

/** Flat array, no pagination — matches `adminApi.getAnnouncements()` -> `apiFetch<Announcement[]>("/admin/announcements")`, zero query params, same "flat list, N most recent" precedent as Phase 9.8's admin orders. */
export async function listAnnouncementsAdmin() {
  const announcements = await Announcement.findAll({
    order: [['createdAt', 'DESC']],
    limit: 200,
    include: ANNOUNCEMENT_INCLUDES,
  });
  return announcements.map(serializeAnnouncement);
}

// ---------------------------------------------------------------------------
// Audience resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the "All Enrolled Students (Sitewide)" (audience='all') / "Specific
 * Enrolled Course Only" (audience='course') composer options — per the
 * composer UI's own option labels, NOT literally every registered account.
 * Judgment call: role='student' + status='active' + at-least-one
 * status='active' enrollment — this excludes pending/suspended accounts,
 * other admins, and expired/revoked enrollments from every broadcast.
 */
export async function resolveAudienceUserIds(audience, courseId) {
  const rows = await Enrollment.findAll({
    where: { status: 'active', ...(audience === 'course' ? { courseId } : {}) },
    attributes: ['userId'],
    include: [{ model: User, as: 'user', attributes: [], where: { role: 'student', status: 'active' }, required: true }],
    raw: true,
  });
  return [...new Set(rows.map((r) => Number(r.userId)))];
}

// ---------------------------------------------------------------------------
// POST /admin/announcements
// ---------------------------------------------------------------------------

export async function createAnnouncementAdmin({ title, body, audience, courseId, sendEmail, createdBy }) {
  if (audience === 'course') {
    if (!courseId) {
      // Defensive only — the controller's zod schema already guarantees this.
      throw new ApiError(422, 'VALIDATION_ERROR', 'courseId is required when audience is "course".');
    }
    const course = await Course.findByPk(courseId);
    if (!course) {
      throw new ApiError(404, 'NOT_FOUND', 'Course not found.');
    }
  }

  // `createdBy` MUST be the authenticated admin's own user id, passed in by
  // the controller from req.user.id — never a client-supplied display-name
  // string. See the controller's own doc comment for why.
  //
  // `title` is plain-text-only; `body` is longer-form admin-authored prose
  // that may reasonably want basic formatting (bold/lists), so it gets the
  // rich-text whitelist (docs/10_SECURITY_CHECKLIST.md §G).
  const announcement = await Announcement.create({
    title: sanitizePlainText(title),
    body: sanitizeRichText(body),
    audience,
    courseId: audience === 'course' ? courseId : null,
    sendEmail: !!sendEmail,
    createdBy: createdBy ?? null,
  });

  const recipientIds = await resolveAudienceUserIds(audience, announcement.courseId);

  // Fan out in-app Notification rows to every resolved recipient IMMEDIATELY
  // (synchronously, before responding), regardless of `sendEmail` — the
  // in-app feed is not the rate-limited channel, only outbound email is.
  if (recipientIds.length > 0) {
    const now = new Date();
    await Notification.bulkCreate(
      recipientIds.map((userId) => ({
        userId,
        type: 'announcement',
        title: announcement.title,
        body: announcement.body,
        link: '/app/notifications',
        isRead: false,
        createdAt: now,
      }))
    );
  }

  if (sendEmail && recipientIds.length > 0) {
    // Fire-and-forget — never let a blast failure affect the HTTP response,
    // matching every other "best-effort mail" precedent in this codebase.
    sendAnnouncementEmailBlast(recipientIds, announcement).catch((err) => {
      logger.error(`[announcementService] email blast failed for announcement ${announcement.id}: ${err.message}`);
    });
  }

  const fresh = await Announcement.findByPk(announcement.id, { include: ANNOUNCEMENT_INCLUDES });
  return serializeAnnouncement(fresh);
}

// ---------------------------------------------------------------------------
// DELETE /admin/announcements/:id
// ---------------------------------------------------------------------------

/**
 * Does NOT cascade-delete already-fanned-out Notification rows — those are
 * independent, already-delivered artifacts; a student who already saw an
 * announcement keeps seeing it in their feed even after an admin deletes the
 * announcement itself.
 */
export async function deleteAnnouncementAdmin(id) {
  const announcement = await Announcement.findByPk(id);
  if (!announcement) {
    throw new ApiError(404, 'NOT_FOUND', 'Announcement not found.');
  }
  await announcement.destroy();
}

// ---------------------------------------------------------------------------
// Email blast (in-memory, non-persisted batching)
// ---------------------------------------------------------------------------

/**
 * Batches `userIds` into chunks of `batchSize`, emailing each chunk then
 * waiting `delayMs` before the next (a crude self-throttle so a large
 * broadcast doesn't fire hundreds of emails in the same instant). Exported
 * so tests can call it directly with a tiny `batchSize`/`delayMs` instead of
 * waiting on real wall-clock minutes — same "test the service function
 * directly, don't test real-time scheduling" discipline as
 * jobs/enrollmentLifecycleCron.js.
 *
 * Accepted tradeoff: this is a purely in-memory, non-persisted queue (no
 * external job/queue infra exists in this stack per CLAUDE.md's fixed tech
 * decisions) — a process restart mid-blast means the remaining
 * not-yet-emailed recipients of THAT SPECIFIC blast never get the email
 * (their in-app Notification row, already created synchronously in
 * createAnnouncementAdmin above, is unaffected). Acceptable for a
 * low-frequency admin broadcast feature on a single-process deployment.
 */
export async function sendAnnouncementEmailBlast(userIds, announcement, { batchSize = 20, delayMs = 60_000 } = {}) {
  let sentCount = 0;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const chunk = userIds.slice(i, i + batchSize);
    const users = await User.findAll({ where: { id: chunk }, attributes: ['id', 'name', 'email'] });

    await Promise.all(
      users
        .filter((u) => u.email)
        .map((u) =>
          sendMail({
            to: u.email,
            subject: `[SAMS Academy] ${announcement.title}`,
            // docs/10_SECURITY_CHECKLIST.md §I: "Emails include unsubscribe
            // note for announcement blasts (transactional exempt)" — this is
            // the one non-transactional bulk email in the codebase (every
            // other sendMail() call — verify/reset/2FA/reverify/receipts/
            // reminders — is a direct response to the recipient's own
            // action, exempt per the checklist's own wording). A plain
            // sender-identification note only, NOT a false claim of a
            // working unsubscribe link/preference toggle — no such mechanism
            // exists anywhere in this codebase (confirmed by a full grep of
            // client/src before writing this; Phase 12.5 security-audit
            // finding L-1). Claiming a nonexistent opt-out would be worse
            // than no note at all; a real one-click unsubscribe needs a new
            // token+route+preference column, deferred as a genuine follow-up
            // (see DECISIONS.md).
            text: `Hi ${u.name},\n\n${announcement.body}\n\n— SAMS Academy\n\nYou're receiving this announcement because you're a registered SAMS Academy candidate. To stop receiving these, please contact support.`,
          })
        )
    );
    sentCount += users.filter((u) => u.email).length;

    const hasMoreChunks = i + batchSize < userIds.length;
    if (hasMoreChunks) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info(
    `[announcementService] email blast for announcement ${announcement.id} complete: ${sentCount}/${userIds.length} recipient(s) emailed.`
  );
  return { sent: sentCount };
}

export default {
  listAnnouncementsForStudent,
  listAnnouncementsAdmin,
  createAnnouncementAdmin,
  deleteAnnouncementAdmin,
  sendAnnouncementEmailBlast,
};
