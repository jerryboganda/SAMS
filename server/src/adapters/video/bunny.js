// server/src/adapters/video/bunny.js
// VideoProvider driver: Bunny Stream (docs/02_ARCHITECTURE.md §6,
// docs/07_EXECUTION_PLAN.md 5.1). Real HTTP calls only — never used unless
// VIDEO_PROVIDER=bunny (server/src/adapters/video/index.js factory).
//
// ---------------------------------------------------------------------------
// Sources verified LIVE on 2026-07-31 (see DECISIONS.md same date for the
// full doc-gap note — do not trust training-data memory for this gateway,
// Bunny has changed this formula across API versions historically):
//
//   1. Token formula (Embedded View Token Authentication):
//      https://bunny.net/docs/stream/token-authentication
//      ("Security" nav > "Embedded view token authentication")
//        expires = UNIX timestamp in SECONDS (doc: "Milliseconds and
//          nanoseconds are not supported")
//        token   = HEX(SHA256(token_security_key + video_id + expiration))
//                  — verbatim from the page's own code sample:
//                  `SHA256_HEX(token_security_key + video_id + expiration)`
//      Query params on the final URL: `token` and `expires`.
//      Iframe embed URL template shown on that page:
//        https://iframe.mediadelivery.net/embed/{library_id}/{video_id}?token={hex}&expires={unix}
//
//      DOC GAP (logged DECISIONS.md 2026-07-31): the page's own worked
//      example is internally inconsistent — its `SHA256(...)` code sample
//      uses one (key, video_id, expiration) triple, but the "example secure
//      URL" immediately below it uses a *different* video_id/expires with
//      the *same* resulting token. We recomputed SHA256 for both triples
//      with the documented key and neither reproduces the shown token, so
//      the numeric example is not independently reproducible. The formula
//      itself is stated unambiguously (twice, in code form) and is what is
//      implemented here; our unit tests use a self-computed deterministic
//      vector instead of Bunny's non-reproducible sample numbers.
//
//   2. Video-existence check (validateRef):
//      https://bunny.net/docs/api-reference/stream/manage-videos/get-video
//        GET https://video.bunnycdn.com/library/{libraryId}/videos/{videoId}
//        Header: `AccessKey: <api-key>`
//        200 -> VideoModel JSON (has `guid`); 404 -> not found; 401 -> bad key.
//
//   3. Direct CDN HLS/MP4 URL structure (used when BUNNY_CDN_HOSTNAME is set):
//      https://bunny.net/docs/stream-how-to-retrieve-an-mp4-url-from-stream
//        HLS:  https://pull_zone_url.b-cdn.net/video_id/playlist.m3u8
//        MP4:  https://pull_zone_url.b-cdn.net/video_id/play_{height}p.mp4
//      https://bunny.net/docs/stream/security-options ("Token Authentication"
//      section) notes that fully protecting HLS *segment* (.ts) files wants
//      the CDN pull-zone's "path-style" Advanced Token Authentication (a
//      different, directory-scoped HMAC scheme configured in the Bunny
//      dashboard), distinct from the simple query-string formula above. This
//      driver signs the playlist URL with the simple, documented formula
//      only (matching docs/02_ARCHITECTURE.md §6's explicit spec and the
//      single BUNNY_TOKEN_AUTH_KEY env var already wired) — enabling
//      path-style segment protection is a Bunny-panel configuration step,
//      not additional application code; see DECISIONS.md 2026-07-31.
//
//   4. Expiry cap: Bunny's docs do not publish a maximum `expires` window —
//      it is an arbitrary future UNIX timestamp. The "≤ 6h" cap is *our*
//      policy (docs/02_ARCHITECTURE.md §6) and is enforced in code below
//      (clampExpirySeconds) regardless of what a caller requests.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import ApiError from '../../utils/apiError.js';
import logger from '../../utils/logger.js';

export const MAX_EXPIRY_SECONDS = 6 * 60 * 60; // 6h hard cap — docs/02_ARCHITECTURE.md §6
const DEFAULT_EXPIRY_SECONDS = 4 * 60 * 60; // sane default, comfortably under the cap

const BUNNY_API_BASE = 'https://video.bunnycdn.com';
const BUNNY_IFRAME_BASE = 'https://iframe.mediadelivery.net/embed';

/** Clamp a requested TTL (seconds) to (0, MAX_EXPIRY_SECONDS] — never trust the caller. */
export function clampExpirySeconds(requestedSeconds) {
  const requested = Number.isFinite(requestedSeconds) && requestedSeconds > 0 ? requestedSeconds : DEFAULT_EXPIRY_SECONDS;
  return Math.min(requested, MAX_EXPIRY_SECONDS);
}

function unixSecondsFromNow(ttlSeconds) {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

/**
 * Bunny's documented Embedded View Token Authentication formula:
 *   token = HEX(SHA256(token_security_key + video_id + expiration))
 * `expiresAtUnixSeconds` must already be a UNIX-seconds integer/string.
 */
export function buildBunnyToken({ securityKey, videoId, expiresAtUnixSeconds }) {
  if (!securityKey) {
    throw new ApiError(500, 'VIDEO_PROVIDER_MISCONFIGURED', 'BUNNY_TOKEN_AUTH_KEY is not set.');
  }
  if (!videoId) {
    throw new ApiError(422, 'VIDEO_NOT_CONFIGURED', 'videoId is required to build a Bunny playback token.');
  }
  const input = `${securityKey}${videoId}${expiresAtUnixSeconds}`;
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Direct CDN HLS playlist URL (docs/stream-how-to-retrieve-an-mp4-url-from-stream). */
export function buildHlsUrl({ cdnHostname, videoId, token, expiresAtUnixSeconds }) {
  return `https://${cdnHostname}/${videoId}/playlist.m3u8?token=${token}&expires=${expiresAtUnixSeconds}`;
}

/** Iframe embed URL (docs/stream/token-authentication worked example structure). */
export function buildIframeUrl({ libraryId, videoId, token, expiresAtUnixSeconds }) {
  return `${BUNNY_IFRAME_BASE}/${libraryId}/${videoId}?token=${token}&expires=${expiresAtUnixSeconds}`;
}

const bunnyProvider = {
  name: 'bunny',

  /** Admin help: where/how to upload a lecture's video for the bunny driver. */
  getUploadInstructions(lecture) {
    const libraryId = env.BUNNY_LIBRARY_ID || '<BUNNY_LIBRARY_ID not set>';
    return {
      summary: `Upload via the Bunny Stream dashboard or API into library ${libraryId}, then paste the resulting video GUID as this lecture's video_ref.`,
      steps: [
        `Bunny dashboard: Stream > Video Libraries > (library ${libraryId}) > Videos > Upload — or via API, see https://bunny.net/docs/api-reference/stream/manage-videos/upload-video`,
        "Copy the uploaded video's GUID (visible on its detail page / API response `guid` field) into this lecture's `video_ref` column.",
        'Wait for the video status to reach "Finished" (transcoding complete) before publishing the lecture — an unfinished video still passes validateRef() but may not be playable yet.',
        `In the library's Security settings: set "Allowed domains" to this app's domain (referer lock) and set the Token Authentication key to the same value as BUNNY_TOKEN_AUTH_KEY in env.`,
      ],
      libraryId: env.BUNNY_LIBRARY_ID || null,
      lectureId: lecture?.id ?? null,
    };
  },

  /**
   * → { type:'hls'|'iframe', url, expiresAt } (docs/02_ARCHITECTURE.md §6).
   * Prefers a direct signed HLS URL when BUNNY_CDN_HOSTNAME is configured;
   * otherwise falls back to the signed iframe embed URL (only needs
   * BUNNY_LIBRARY_ID). `opts.ttlSeconds` lets a caller request a shorter
   * window; the ≤6h cap is enforced unconditionally either way.
   */
  async getPlaybackConfig(lecture, _user, opts = {}) {
    const videoId = lecture?.videoRef;
    if (!videoId) {
      throw new ApiError(422, 'VIDEO_NOT_CONFIGURED', "This lecture has no video_ref set for the bunny provider.");
    }
    const ttlSeconds = clampExpirySeconds(opts.ttlSeconds);
    const expiresAtUnixSeconds = unixSecondsFromNow(ttlSeconds);
    const token = buildBunnyToken({ securityKey: env.BUNNY_TOKEN_AUTH_KEY, videoId, expiresAtUnixSeconds });

    const useHls = Boolean(env.BUNNY_CDN_HOSTNAME);
    const url = useHls
      ? buildHlsUrl({ cdnHostname: env.BUNNY_CDN_HOSTNAME, videoId, token, expiresAtUnixSeconds })
      : buildIframeUrl({ libraryId: env.BUNNY_LIBRARY_ID, videoId, token, expiresAtUnixSeconds });

    return {
      type: useHls ? 'hls' : 'iframe',
      url,
      expiresAt: new Date(expiresAtUnixSeconds * 1000).toISOString(),
    };
  },

  /**
   * Ping the Bunny Stream Library API to confirm a video GUID exists.
   * Returns `false` only for a definitive 404 ("not found"); any other
   * failure (bad key, network error, 5xx) throws so misconfiguration is
   * surfaced instead of silently looking like "video doesn't exist".
   */
  async validateRef(videoRef) {
    if (!videoRef) return false;
    if (!env.BUNNY_LIBRARY_ID || !env.BUNNY_API_KEY) {
      throw new ApiError(500, 'VIDEO_PROVIDER_MISCONFIGURED', 'BUNNY_LIBRARY_ID/BUNNY_API_KEY are not set.');
    }

    const url = `${BUNNY_API_BASE}/library/${env.BUNNY_LIBRARY_ID}/videos/${videoRef}`;
    let res;
    try {
      res = await fetch(url, { method: 'GET', headers: { AccessKey: env.BUNNY_API_KEY } });
    } catch (err) {
      logger.error('[bunny] validateRef network error', { videoRef, error: err.message });
      throw new ApiError(502, 'VIDEO_PROVIDER_UNREACHABLE', 'Could not reach the Bunny Stream API.');
    }

    if (res.status === 404) return false;
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(502, 'VIDEO_PROVIDER_AUTH_ERROR', 'Bunny Stream API rejected BUNNY_API_KEY.');
    }
    if (!res.ok) {
      throw new ApiError(502, 'VIDEO_PROVIDER_ERROR', `Bunny Stream API returned HTTP ${res.status}.`);
    }

    const body = await res.json();
    return body?.guid === videoRef;
  },
};

export default bunnyProvider;
