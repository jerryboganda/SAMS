// server/src/services/videoService.js
// Business logic for the secure video-playback + progress/bookmark endpoints
// (docs/04_API_SPEC.md §3, docs/02_ARCHITECTURE.md §4 "Concurrent stream
// lock"). This is the single most security-critical endpoint group in the
// app (video piracy prevention) — see DECISIONS.md's Phase 5.2/5.3 entry for
// every judgment call made here (anonymous-preview session handling, the
// delta/position clamp bounds, the completion threshold, the 401-vs-404
// choice for a foreign sessionKey, and the confirmed frontend response
// contract: `resumeAtSeconds` / `watermark.timestamp`, not the API spec
// shorthand's `resumeAt` / `watermark.now`).
import { getVideoProvider } from '../adapters/video/index.js';
import { ApiError } from '../utils/apiError.js';
import { randomUuid } from '../utils/crypto.js';
import { findActiveDeviceByToken } from './deviceService.js';
import {
  HEARTBEAT_DELTA_MIN_SECONDS,
  HEARTBEAT_DELTA_MAX_SECONDS,
  LECTURE_COMPLETE_THRESHOLD_RATIO,
} from '../config/constants.js';
import db from '../models/index.js';

const { Lecture, Course, Enrollment, PlaybackSession, LectureProgress, LectureBookmark, UserDailyStat, User, sequelize } = db;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  const n = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(n, min), max);
}

function todayUtcDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Loads a lecture + its course, 404ing whenever the lecture doesn't exist OR
 * its course/lecture isn't published — deliberately the same generic 404 for
 * both cases so an unpublished lecture's existence is never distinguishable
 * from a nonexistent id (course_sections has no publish flag of its own per
 * docs/03_DATABASE_SCHEMA.md, so there's nothing extra to check there).
 */
async function loadPlayableLecture(lectureId) {
  const lecture = await Lecture.findOne({
    where: { id: lectureId },
    include: [{ model: Course, as: 'course' }],
  });
  if (!lecture || !lecture.isPublished || !lecture.course || !lecture.course.isPublished) {
    throw new ApiError(404, 'NOT_FOUND', 'Lecture not found.');
  }
  return lecture;
}

/**
 * Enrollment gate shared by /play, /complete, and the bookmark endpoints.
 * Distinguishes "never enrolled" (403 NOT_ENROLLED) from "enrolled at some
 * point but not currently active-and-unexpired" (403 ENROLLMENT_EXPIRED,
 * which also covers a manually-revoked enrollment — docs/04_API_SPEC.md §3
 * only names these two codes, so `status='revoked'` intentionally maps to
 * ENROLLMENT_EXPIRED rather than a third code). A user can have more than
 * one enrollment row for the same course over time (repurchase after expiry,
 * manual admin grant, ...) — access is allowed if ANY row is currently
 * active-and-unexpired.
 */
async function assertEnrolled(userId, courseId) {
  const enrollments = await Enrollment.findAll({ where: { userId, courseId } });
  if (enrollments.length === 0) {
    throw new ApiError(403, 'NOT_ENROLLED', 'You are not enrolled in this course.');
  }
  const now = new Date();
  const active = enrollments.find((e) => e.status === 'active' && new Date(e.expiresAt) > now);
  if (!active) {
    throw new ApiError(403, 'ENROLLMENT_EXPIRED', 'Your enrollment for this course has expired.');
  }
  return active;
}

/**
 * Steals any existing active playback_sessions row for this user (the whole
 * platform, not per-lecture — docs/02_ARCHITECTURE.md §4) by closing it
 * (`ended_at = NOW()`), then opens a fresh one for `lectureId`. Every row
 * with `ended_at IS NULL` is closed unconditionally, whether it's genuinely
 * live or already stale (>90s since its last heartbeat) — a stale row is
 * "effectively dead" and safe to silently supersede with no special
 * handling either way (see PLAYBACK_STALE_HEARTBEAT_SECONDS's doc comment).
 * This is what makes the OLD session's next heartbeat 409 in heartbeat().
 *
 * Security audit 2026-07-31 (Finding 1, HIGH): the close-then-create pair
 * used to run as two independent, unsynchronized statements. Concurrent
 * `/play` requests for the SAME user (e.g. 15 simultaneous tabs) could each
 * read "no active row yet / an active row exists" and race past each
 * other's UPDATE before any of them INSERTed, so more than one row ended up
 * with `ended_at IS NULL` at once — defeating the single-concurrent-stream
 * lock. Fixed by making the whole read-close-create sequence atomic PER
 * USER: wrap it in a transaction and take an InnoDB row lock
 * (`SELECT ... FOR UPDATE` via `lock: transaction.LOCK.UPDATE`) on that
 * user's `users` row first. Concurrent calls for the SAME userId now
 * serialize on that row lock (each waits for the previous transaction to
 * commit before it can proceed), so the update+create pair is effectively
 * atomic; concurrent calls for DIFFERENT users lock different rows and stay
 * fully parallel — see DECISIONS.md 2026-07-31 for why this approach (over
 * e.g. a dedicated lock table) was chosen.
 */
async function acquirePlaybackSession(userId, lectureId, deviceId) {
  return sequelize.transaction(async (transaction) => {
    // Row lock on this user only — serializes concurrent acquirePlaybackSession
    // calls for the SAME userId without contending with other users' calls.
    await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });

    await PlaybackSession.update(
      { endedAt: new Date() },
      { where: { userId, endedAt: null }, transaction }
    );
    return PlaybackSession.create(
      {
        userId,
        lectureId,
        deviceId: deviceId ?? null,
        sessionKey: randomUuid(),
        lastHeartbeatAt: new Date(),
        endedAt: null,
      },
      { transaction }
    );
  });
}

/** Adapter-layer `type` -> client PlaybackConfig.playback.type union ("hls"|"iframe"|"video"). */
function mapPlaybackType(adapterType) {
  return adapterType === 'mp4' ? 'video' : adapterType;
}

// ---------------------------------------------------------------------------
// GET /student/lectures/:id/play
// ---------------------------------------------------------------------------

/**
 * `user` is `req.user` (`{id, role}` from the access JWT) or `null`/`undefined`
 * when unauthenticated. `rawDeviceToken` is the raw `device_token` cookie
 * value (or undefined). Non-preview lectures require both a valid user AND a
 * valid device (equivalent to the standard `auth -> deviceCheck` chain,
 * applied inline here since this route must also serve anonymous free-preview
 * requests that never pass through `auth`/`deviceCheck` at all).
 */
export async function getLecturePlayback({ lectureId, user, rawDeviceToken }) {
  const lecture = await loadPlayableLecture(lectureId);
  const isPreview = Boolean(lecture.isFreePreview);

  let effectiveUser = null;
  let effectiveDeviceId = null;

  if (!isPreview) {
    if (!user) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }
    const device = await findActiveDeviceByToken(user.id, rawDeviceToken);
    if (!device) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Device not recognized — please log in again.');
    }
    await assertEnrolled(user.id, lecture.courseId);
    effectiveUser = user;
    effectiveDeviceId = device.id;
  } else if (user) {
    // Authenticated viewer on a free-preview lecture: still eligible for the
    // real stream-lock/watermark treatment IF their device checks out, but —
    // unlike the non-preview branch — an invalid/missing device does NOT
    // fail the request (preview must stay reachable per docs/04_API_SPEC.md
    // §3's "P allowed"). It just falls through to anonymous-preview
    // behavior. See DECISIONS.md.
    const device = await findActiveDeviceByToken(user.id, rawDeviceToken);
    if (device) {
      effectiveUser = user;
      effectiveDeviceId = device.id;
    }
  }

  let watermark;
  let resumeAtSeconds = 0;
  let sessionKey;

  if (effectiveUser) {
    const userRow = await User.findByPk(effectiveUser.id);
    const session = await acquirePlaybackSession(effectiveUser.id, lecture.id, effectiveDeviceId);
    sessionKey = session.sessionKey;
    watermark = {
      name: userRow?.name ?? 'Student',
      email: userRow?.email ?? '',
      timestamp: new Date().toISOString(),
    };
    const progress = await LectureProgress.findOne({ where: { userId: effectiveUser.id, lectureId: lecture.id } });
    resumeAtSeconds = progress ? progress.lastPositionSeconds : 0;
  } else {
    // Anonymous free-preview viewer: no user to hold a stream-lock slot for,
    // so `sessionKey` is a fresh UUID that is NEVER persisted to
    // playback_sessions — it satisfies the PlaybackConfig contract shape but
    // isn't tied to any lock (a heartbeat call would require role S and thus
    // 401 for an anonymous caller anyway — see routes/v1/student/lectures.js).
    sessionKey = randomUuid();
    watermark = { name: 'PREVIEW', email: 'PREVIEW', timestamp: new Date().toISOString() };
    resumeAtSeconds = 0;
  }

  const adapterConfig = await getVideoProvider().getPlaybackConfig(lecture, effectiveUser);

  return {
    playback: {
      type: mapPlaybackType(adapterConfig.type),
      url: adapterConfig.url,
      expiresAt: adapterConfig.expiresAt,
    },
    watermark,
    resumeAtSeconds,
    sessionKey,
  };
}

// ---------------------------------------------------------------------------
// PUT /student/lectures/:id/heartbeat
// ---------------------------------------------------------------------------

// Note: the caller (controller) also has the URL's `:id` (lectureId) but it
// is deliberately not used here — see the session.lectureId comment below.
export async function heartbeat({ user, sessionKey, positionSeconds, deltaSeconds }) {
  // IDOR check: a session_key must belong to the requesting user — looked up
  // by (sessionKey AND userId) together, so someone else's sessionKey never
  // resolves. Treated the same as "doesn't exist" (404), consistent with how
  // this codebase treats other not-mine resources (e.g. 04 API's 404 NOT_FOUND
  // convention rather than a distinguishing 403 that would confirm the key's
  // existence to an attacker) — see DECISIONS.md.
  const session = await PlaybackSession.findOne({ where: { sessionKey, userId: user.id } });
  if (!session) {
    throw new ApiError(404, 'NOT_FOUND', 'Playback session not found.');
  }

  // The core "second stream steals first" mechanic: a superseded session's
  // next heartbeat is rejected so its player stops.
  if (session.endedAt !== null) {
    throw new ApiError(409, 'STREAM_TAKEN_OVER', 'This playback session was replaced by a newer session.');
  }

  // Progress is recorded against the lecture the SESSION was actually opened
  // for (session.lectureId), not blindly trusted from the URL's `:id` — a
  // client always calls heartbeat with the same lectureId it requested /play
  // for, but should the two ever disagree (buggy/malicious client), the
  // session is the authoritative source of which lecture this heartbeat
  // belongs to.
  const lecture = await Lecture.findByPk(session.lectureId);
  if (!lecture) {
    throw new ApiError(404, 'NOT_FOUND', 'Lecture not found.');
  }

  const clampedDelta = clamp(deltaSeconds, HEARTBEAT_DELTA_MIN_SECONDS, HEARTBEAT_DELTA_MAX_SECONDS);
  const maxPosition = lecture.durationSeconds > 0 ? lecture.durationSeconds : Number.MAX_SAFE_INTEGER;
  const clampedPosition = clamp(positionSeconds, 0, maxPosition);

  // Security audit 2026-07-31 (Finding 2, Medium): the client-claimed `delta`
  // is only ever advisory, so beyond the [MIN, MAX] clamp above it is ALSO
  // cross-checked against real wall-clock time elapsed since this session's
  // OWN last heartbeat — otherwise a scripted client firing heartbeats far
  // faster than the real ~15s cadence (client/src/components/player/
  // SecurePlayer.tsx) could claim HEARTBEAT_DELTA_MAX_SECONDS on every call
  // and inflate lecture_progress.watched_seconds / user_daily_stats.video_
  // seconds faster than real time allows (analytics/stats integrity — video
  // ACCESS itself is unaffected, see heartbeatLimiter in
  // middleware/rateLimits.js for the companion request-volume bound).
  // `actualElapsedSeconds` is itself clamped into the same [MIN, MAX] range
  // as an elapsed-time ceiling (a long-idle gap before a heartbeat still
  // only ever credits up to the existing max, exactly as before this fix),
  // and the seconds actually credited are the SMALLER of the client's
  // clamped claim and that elapsed-time ceiling — neither bound alone
  // determines the credit, both must agree.
  const now = new Date();
  const actualElapsedSeconds = (now.getTime() - new Date(session.lastHeartbeatAt).getTime()) / 1000;
  const elapsedCeiling = clamp(actualElapsedSeconds, HEARTBEAT_DELTA_MIN_SECONDS, HEARTBEAT_DELTA_MAX_SECONDS);
  const effectiveDelta = Math.min(clampedDelta, elapsedCeiling);

  session.lastHeartbeatAt = now;
  await session.save();

  const [progress] = await LectureProgress.findOrCreate({
    where: { userId: user.id, lectureId: lecture.id },
    defaults: { watchedSeconds: 0, lastPositionSeconds: 0, isCompleted: false },
  });

  progress.watchedSeconds += effectiveDelta;
  progress.lastPositionSeconds = clampedPosition;

  const isNowComplete =
    !progress.isCompleted &&
    lecture.durationSeconds > 0 &&
    clampedPosition / lecture.durationSeconds >= LECTURE_COMPLETE_THRESHOLD_RATIO;
  if (isNowComplete) {
    progress.isCompleted = true;
    progress.completedAt = new Date();
  }
  await progress.save();

  const statDate = todayUtcDateOnly();
  const [dailyStat] = await UserDailyStat.findOrCreate({
    where: { userId: user.id, statDate },
    defaults: { videoSeconds: 0 },
  });
  dailyStat.videoSeconds += effectiveDelta;
  await dailyStat.save();

  return {
    status: 'ok',
    progress: {
      watchedSeconds: progress.watchedSeconds,
      lastPositionSeconds: progress.lastPositionSeconds,
      isCompleted: progress.isCompleted,
      completedAt: progress.completedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /student/lectures/:id/complete
// ---------------------------------------------------------------------------

export async function markLectureComplete({ lectureId, user }) {
  const lecture = await loadPlayableLecture(lectureId);
  await assertEnrolled(user.id, lecture.courseId);

  const [progress] = await LectureProgress.findOrCreate({
    where: { userId: user.id, lectureId: lecture.id },
    defaults: { watchedSeconds: 0, lastPositionSeconds: 0, isCompleted: false },
  });

  if (!progress.isCompleted) {
    progress.isCompleted = true;
    progress.completedAt = new Date();
    await progress.save();
  }

  return { isCompleted: progress.isCompleted, completedAt: progress.completedAt };
}

// ---------------------------------------------------------------------------
// POST/DELETE /student/lectures/:id/bookmark, GET /student/bookmarks/lectures
// ---------------------------------------------------------------------------

export async function addLectureBookmark({ lectureId, user }) {
  const lecture = await loadPlayableLecture(lectureId);
  await assertEnrolled(user.id, lecture.courseId);

  await LectureBookmark.findOrCreate({ where: { userId: user.id, lectureId: lecture.id } });
  return { isBookmarked: true };
}

export async function removeLectureBookmark({ lectureId, user }) {
  const lecture = await loadPlayableLecture(lectureId);
  await assertEnrolled(user.id, lecture.courseId);

  await LectureBookmark.destroy({ where: { userId: user.id, lectureId: lecture.id } });
  return { isBookmarked: false };
}

function serializeBookmarkedLecture(lecture, progress) {
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    sectionId: lecture.sectionId,
    title: lecture.title,
    description: lecture.description,
    videoProvider: lecture.videoProvider,
    videoRef: lecture.videoRef,
    durationSeconds: lecture.durationSeconds,
    isFreePreview: lecture.isFreePreview,
    isPublished: lecture.isPublished,
    sortOrder: lecture.sortOrder,
    watchedSeconds: progress ? progress.watchedSeconds : 0,
    isCompleted: progress ? progress.isCompleted : false,
    isBookmarked: true,
  };
}

export async function listBookmarkedLectures({ user }) {
  const bookmarks = await LectureBookmark.findAll({
    where: { userId: user.id },
    order: [['id', 'DESC']],
    include: [{ model: Lecture, as: 'lecture' }],
  });

  const lectures = bookmarks.map((b) => b.lecture).filter(Boolean);
  if (lectures.length === 0) return [];

  const progresses = await LectureProgress.findAll({
    where: { userId: user.id, lectureId: lectures.map((l) => l.id) },
  });
  const progressByLectureId = new Map(progresses.map((p) => [p.lectureId, p]));

  return lectures.map((lecture) => serializeBookmarkedLecture(lecture, progressByLectureId.get(lecture.id)));
}

export default {
  getLecturePlayback,
  heartbeat,
  markLectureComplete,
  addLectureBookmark,
  removeLectureBookmark,
  listBookmarkedLectures,
};
