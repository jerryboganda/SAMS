// client/src/components/player/playerLogic.ts
//
// Pure, side-effect-free logic extracted out of SecurePlayer.tsx so it can
// be unit-tested without mounting a component / mocking `hls.js` / faking
// timers on a `<video>` element (see playerLogic.test.ts). Every function
// here is deterministic given its inputs — SecurePlayer.tsx is the only
// caller and owns all the actual scheduling (setTimeout/setInterval) and
// DOM/network side effects; this module only computes numbers/booleans/
// strings from inputs.
//
// docs/07_EXECUTION_PLAN.md 5.4's AC explicitly calls out "vitest logic
// (watermark scheduler, heartbeat backoff)" — this module + its test file
// are that coverage, plus the takeover-detection and token-refresh-timing
// logic the same task asks SecurePlayer to get right against the real
// backend contract (server/src/services/videoService.js).

/** Heartbeat cadence: docs/02_ARCHITECTURE.md §4 says "~30s"; the already-built
 * frontend (and the backend's own DECISIONS.md note on it) uses 15s — kept as-is,
 * comfortably inside the documented window. */
export const HEARTBEAT_BASE_INTERVAL_MS = 15_000;
/** Exponential-backoff ceiling for consecutive heartbeat failures (network
 * hiccups, transient 5xx — NOT a 409 takeover, which stops scheduling entirely). */
export const HEARTBEAT_MAX_INTERVAL_MS = 120_000;

/** Cosmetic anti-piracy watermark reposition cadence — unrelated to the network. */
export const WATERMARK_REPOSITION_INTERVAL_MS = 20_000;

/** How long before `playback.expiresAt` to proactively re-fetch a fresh signed URL. */
export const TOKEN_REFRESH_BUFFER_MS = 60_000;
/** Never schedule the refresh timer for less than this — guards against a
 * clock-skew/near-past `expiresAt` causing a tight refresh loop. */
export const TOKEN_REFRESH_MIN_DELAY_MS = 5_000;
/** Retry delay after a failed refresh attempt (kept short — the old URL is
 * still valid until the real `expiresAt`, so a quick retry is safe). */
export const TOKEN_REFRESH_RETRY_DELAY_MS = 30_000;

/** Minimum resume position (seconds) worth telling the viewer about via the
 * "Resuming from X:XX" indicator — a 2-second resume isn't worth a banner. */
export const RESUME_NOTICE_MIN_SECONDS = 5;
export const RESUME_NOTICE_VISIBLE_MS = 6_000;

/**
 * Exponential backoff for the heartbeat loop: `consecutiveFailures` counts
 * failed heartbeat calls since the last success (a 409 takeover is NOT a
 * "failure" here — the caller stops scheduling entirely on 409, see
 * `shouldTriggerTakeover`). 0 failures → the normal base interval; each
 * additional failure doubles the delay, capped at `maxMs`.
 */
export function computeNextHeartbeatDelayMs(
  consecutiveFailures: number,
  baseMs: number = HEARTBEAT_BASE_INTERVAL_MS,
  maxMs: number = HEARTBEAT_MAX_INTERVAL_MS
): number {
  const safeFailures = Number.isFinite(consecutiveFailures) && consecutiveFailures > 0 ? Math.floor(consecutiveFailures) : 0;
  const delay = baseMs * Math.pow(2, safeFailures);
  return Math.min(delay, maxMs);
}

/**
 * Matches `server/src/services/videoService.js#heartbeat`'s
 * `409 STREAM_TAKEN_OVER` response exactly (status 409, or the envelope's
 * error code — checked either way since `ApiError` always carries both, but
 * a defensive caller shouldn't rely on only one of them being set).
 */
export function shouldTriggerTakeover(status?: number, code?: string): boolean {
  return status === 409 || code === "STREAM_TAKEN_OVER";
}

/**
 * Deterministic-shape (not deterministic-value) watermark reposition: a
 * random quadrant/corner, injectable RNG so tests can assert the output
 * bounds without depending on `Math.random`.
 */
export function computeWatermarkPosition(rng: () => number = Math.random): { top: string; left: string } {
  const topPct = Math.floor(rng() * 65 + 10);
  const leftPct = Math.floor(rng() * 60 + 10);
  return { top: `${topPct}%`, left: `${leftPct}%` };
}

/**
 * Milliseconds until the player should proactively re-fetch `/play` for a
 * fresh signed URL, given the current `playback.expiresAt` (ISO string).
 * Always at least `minMs` — an already-expired/near-expired/invalid
 * `expiresAt` still schedules a near-immediate (not synchronous/looping)
 * refresh rather than never refreshing or refreshing in a tight loop.
 */
export function computeMsUntilTokenRefresh(
  expiresAtIso: string,
  nowMs: number,
  bufferMs: number = TOKEN_REFRESH_BUFFER_MS,
  minMs: number = TOKEN_REFRESH_MIN_DELAY_MS
): number {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresAtMs)) return minMs;
  return Math.max(expiresAtMs - nowMs - bufferMs, minMs);
}

/**
 * Whether a just-loaded resume position is worth surfacing to the viewer
 * via the "Resuming from X:XX" indicator (see RESUME_NOTICE_MIN_SECONDS).
 */
export function shouldShowResumeNotice(resumeAtSeconds: number): boolean {
  return Number.isFinite(resumeAtSeconds) && resumeAtSeconds >= RESUME_NOTICE_MIN_SECONDS;
}

/**
 * Best-effort "this lecture was already completed in a prior session"
 * inference from `/play`'s `resumeAtSeconds` against the lecture's known
 * duration — used because there is no bulk per-lecture progress endpoint
 * yet (`GET /student/courses/:courseId` is docs/04_API_SPEC.md §3's
 * planned source of truth, not built until Phase 6 — see DECISIONS.md).
 * Mirrors the backend's own completion ratio
 * (`LECTURE_COMPLETE_THRESHOLD_RATIO = 0.95` in
 * server/src/config/constants.js) minus a little slack, since a resumed
 * position is "last watched to", not "watched up to and then explicitly
 * completed" — 0.9 avoids false negatives from the last few seconds of
 * buffering/rounding.
 */
export function inferAlreadyCompletedFromResume(resumeAtSeconds: number, durationSeconds: number | undefined): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false;
  if (!Number.isFinite(resumeAtSeconds) || resumeAtSeconds <= 0) return false;
  return resumeAtSeconds / durationSeconds >= 0.9;
}

/** `mm:ss` (or `h:mm:ss` past an hour) formatting shared by the seek bar and the resume indicator. */
export function formatPlayerTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Formats the server-issued `watermark.timestamp` (an ISO string, set fresh
 * on every `/play` call and every token-refresh re-call) for on-screen
 * display. Deliberately reads the REAL server timestamp rather than a
 * client-side ticking clock — see DECISIONS.md for why: the position
 * already moves every WATERMARK_REPOSITION_INTERVAL_MS (the actual
 * anti-piracy deterrent), and a server timestamp additionally proves
 * *which playback session* a leaked recording came from, which a purely
 * client-side `Date.now()` clock cannot.
 */
export function formatWatermarkTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
