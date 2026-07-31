// server/src/adapters/video/mock.js
// VideoProvider driver: `mock` (default per .env.example — docs/02_ARCHITECTURE.md
// §6, docs/07_EXECUTION_PLAN.md 5.1). Zero credentials required: every lecture
// plays the same tiny local sample file committed at storage/dev-assets/sample.mp4
// (~13 KB, 5s, 320x240 H.264 — generated with ffmpeg, see DECISIONS.md
// 2026-07-31), served by a dev-only static route wired in server/src/app.js
// (`GET /dev-assets/*`, disabled when NODE_ENV=production).
import { MAX_EXPIRY_SECONDS } from './bunny.js';

export const MOCK_ASSET_PATH = '/dev-assets/sample.mp4';

function buildExpiresAt(ttlSeconds = MAX_EXPIRY_SECONDS) {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

const mockProvider = {
  name: 'mock',

  /** Admin help: where/how to upload a lecture's video for the mock driver. */
  getUploadInstructions(lecture) {
    return {
      summary: 'Mock video provider — no upload needed.',
      steps: [
        'VIDEO_PROVIDER=mock always serves the same committed local sample file ' +
          '(storage/dev-assets/sample.mp4, exposed at GET /dev-assets/sample.mp4 outside production) ' +
          'for every lecture, regardless of video_ref.',
        'Set this lecture\'s video_ref to any non-empty placeholder string (e.g. "mock") so ' +
          'validation that requires a video_ref still passes.',
        'Switch VIDEO_PROVIDER=bunny (and set BUNNY_LIBRARY_ID/BUNNY_API_KEY/BUNNY_TOKEN_AUTH_KEY) to serve real per-lecture video.',
      ],
      lectureId: lecture?.id ?? null,
    };
  },

  /**
   * → { type:'mp4', url, expiresAt } — a genuinely playable local URL with
   * zero credentials. `type:'mp4'` (a plain file, not HLS-segmented) is
   * distinct from the bunny driver's 'hls'|'iframe'; the future
   * `/student/lectures/:id/play` endpoint (Phase 5.2) maps adapter-layer
   * types onto the client's PlaybackConfig.playback.type union
   * ("hls"|"iframe"|"video" — client/src/api/endpoints/video.ts), i.e.
   * adapter 'mp4' -> client 'video'. See DECISIONS.md 2026-07-31.
   */
  async getPlaybackConfig(_lecture, _user) {
    return {
      type: 'mp4',
      url: MOCK_ASSET_PATH,
      expiresAt: buildExpiresAt(),
    };
  },

  /** No real backend to check against — "valid" iff a ref string was actually provided. */
  async validateRef(videoRef) {
    return Boolean(videoRef);
  },
};

export default mockProvider;
