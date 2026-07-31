// server/tests/adapters/video/bunny.test.js
// Unit tests for the `bunny` VideoProvider driver (docs/07_EXECUTION_PLAN.md
// 5.1). No network/DB involved — global.fetch is stubbed for validateRef().
//
// Doc sources (verified live 2026-07-31 — see server/src/adapters/video/bunny.js
// header comment + DECISIONS.md same date for the full doc-gap note):
//   - https://bunny.net/docs/stream/token-authentication
//       formula: SHA256_HEX(token_security_key + video_id + expiration)
//       iframe URL: https://iframe.mediadelivery.net/embed/{library}/{video}?token=...&expires=...
//   - https://bunny.net/docs/stream-how-to-retrieve-an-mp4-url-from-stream
//       HLS URL: https://pull_zone_url.b-cdn.net/video_id/playlist.m3u8
//   - https://bunny.net/docs/api-reference/stream/manage-videos/get-video
//       GET https://video.bunnycdn.com/library/{libraryId}/videos/{videoId}, header AccessKey
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { env } from '../../../src/config/env.js';
import ApiError from '../../../src/utils/apiError.js';
import bunnyProvider, {
  MAX_EXPIRY_SECONDS,
  buildBunnyToken,
  buildHlsUrl,
  buildIframeUrl,
  clampExpirySeconds,
} from '../../../src/adapters/video/bunny.js';

describe('bunny video adapter — token math', () => {
  test('buildBunnyToken matches Bunny\'s documented formula: HEX(SHA256(key + video_id + expiration))', () => {
    // Fixed, deterministic vector (Bunny's own doc page worked example numbers
    // are not independently reproducible — see the doc-gap note in
    // server/src/adapters/video/bunny.js — so this vector is self-computed
    // with Node's own crypto module, proving buildBunnyToken() implements the
    // exact documented concatenation order + SHA256 + hex encoding).
    const securityKey = '4742a81b-bf15-42fe-8b1c-8fcb9024c550'; // from Bunny's doc example
    const videoId = '32d140e2-e4f4-4eec-9d53-20371e9be607'; // from Bunny's doc example
    const expiresAtUnixSeconds = 1623440202; // from Bunny's doc example

    const expected = crypto
      .createHash('sha256')
      .update(`${securityKey}${videoId}${expiresAtUnixSeconds}`, 'utf8')
      .digest('hex');

    const actual = buildBunnyToken({ securityKey, videoId, expiresAtUnixSeconds });

    expect(actual).toBe(expected);
    expect(actual).toMatch(/^[0-9a-f]{64}$/); // 64 lowercase hex chars = SHA-256 digest
  });

  test('changing any one input (key, video id, or expiration) changes the token', () => {
    const base = { securityKey: 'key-a', videoId: 'video-a', expiresAtUnixSeconds: 1000 };
    const t0 = buildBunnyToken(base);
    expect(buildBunnyToken({ ...base, securityKey: 'key-b' })).not.toBe(t0);
    expect(buildBunnyToken({ ...base, videoId: 'video-b' })).not.toBe(t0);
    expect(buildBunnyToken({ ...base, expiresAtUnixSeconds: 1001 })).not.toBe(t0);
  });

  test('throws VIDEO_PROVIDER_MISCONFIGURED when the security key is missing', () => {
    expect(() => buildBunnyToken({ securityKey: '', videoId: 'v', expiresAtUnixSeconds: 1 })).toThrow(ApiError);
    try {
      buildBunnyToken({ securityKey: '', videoId: 'v', expiresAtUnixSeconds: 1 });
    } catch (err) {
      expect(err.code).toBe('VIDEO_PROVIDER_MISCONFIGURED');
    }
  });

  test('throws VIDEO_NOT_CONFIGURED when videoId is missing', () => {
    try {
      buildBunnyToken({ securityKey: 'k', videoId: '', expiresAtUnixSeconds: 1 });
      throw new Error('expected buildBunnyToken to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('VIDEO_NOT_CONFIGURED');
    }
  });
});

describe('bunny video adapter — signed URL structure', () => {
  test('buildIframeUrl matches the documented iframe embed URL template', () => {
    const token = 'a'.repeat(64);
    const url = buildIframeUrl({ libraryId: '759', videoId: 'eb1c4f77-0cda-46be-b47d-1118ad7c2ffe', token, expiresAtUnixSeconds: 1456761770 });
    expect(url).toBe(
      'https://iframe.mediadelivery.net/embed/759/eb1c4f77-0cda-46be-b47d-1118ad7c2ffe?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&expires=1456761770'
    );
  });

  test('buildHlsUrl matches the documented CDN pull-zone playlist URL structure', () => {
    const token = 'b'.repeat(64);
    const url = buildHlsUrl({ cdnHostname: 'sams-videos.b-cdn.net', videoId: 'guid-123', token, expiresAtUnixSeconds: 999 });
    expect(url).toBe(
      'https://sams-videos.b-cdn.net/guid-123/playlist.m3u8?token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&expires=999'
    );
  });
});

describe('bunny video adapter — 6h expiry cap (docs/02_ARCHITECTURE.md §6)', () => {
  test('clampExpirySeconds never exceeds MAX_EXPIRY_SECONDS (6h) even when a longer window is requested', () => {
    expect(MAX_EXPIRY_SECONDS).toBe(6 * 60 * 60);
    expect(clampExpirySeconds(100 * 60 * 60)).toBe(MAX_EXPIRY_SECONDS); // 100h requested -> capped
    expect(clampExpirySeconds(Number.MAX_SAFE_INTEGER)).toBe(MAX_EXPIRY_SECONDS);
  });

  test('clampExpirySeconds passes through a requested window that is already under the cap', () => {
    expect(clampExpirySeconds(60)).toBe(60);
    expect(clampExpirySeconds(3600)).toBe(3600);
  });

  test('clampExpirySeconds falls back to a sane default (still under the cap) for invalid input', () => {
    expect(clampExpirySeconds(undefined)).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS);
    expect(clampExpirySeconds(-5)).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS);
    expect(clampExpirySeconds(0)).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS);
    expect(clampExpirySeconds(NaN)).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS);
  });
});

describe('bunny video adapter — getPlaybackConfig / getUploadInstructions', () => {
  const original = {
    BUNNY_LIBRARY_ID: env.BUNNY_LIBRARY_ID,
    BUNNY_API_KEY: env.BUNNY_API_KEY,
    BUNNY_TOKEN_AUTH_KEY: env.BUNNY_TOKEN_AUTH_KEY,
    BUNNY_CDN_HOSTNAME: env.BUNNY_CDN_HOSTNAME,
  };

  beforeEach(() => {
    env.BUNNY_LIBRARY_ID = '759';
    env.BUNNY_API_KEY = 'test-api-key';
    env.BUNNY_TOKEN_AUTH_KEY = 'test-token-security-key';
    env.BUNNY_CDN_HOSTNAME = '';
  });

  afterEach(() => {
    Object.assign(env, original);
  });

  test('never exceeds the 6h expiry cap even when a longer TTL is requested', async () => {
    const lecture = { id: 1, videoRef: 'guid-abc' };
    const before = Date.now();
    const config = await bunnyProvider.getPlaybackConfig(lecture, null, { ttlSeconds: 100 * 60 * 60 });
    const expiresInMs = new Date(config.expiresAt).getTime() - before;
    expect(expiresInMs).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS * 1000 + 1000); // +1s slack for test execution time
  });

  test('falls back to a signed iframe URL when BUNNY_CDN_HOSTNAME is not configured', async () => {
    const lecture = { id: 1, videoRef: 'guid-abc' };
    const config = await bunnyProvider.getPlaybackConfig(lecture, null);
    expect(config.type).toBe('iframe');
    expect(config.url).toContain('https://iframe.mediadelivery.net/embed/759/guid-abc?token=');
    expect(config.url).toMatch(/token=[0-9a-f]{64}&expires=\d+$/);
  });

  test('returns a signed direct HLS URL when BUNNY_CDN_HOSTNAME is configured', async () => {
    env.BUNNY_CDN_HOSTNAME = 'sams-videos.b-cdn.net';
    const lecture = { id: 1, videoRef: 'guid-abc' };
    const config = await bunnyProvider.getPlaybackConfig(lecture, null);
    expect(config.type).toBe('hls');
    expect(config.url).toContain('https://sams-videos.b-cdn.net/guid-abc/playlist.m3u8?token=');
  });

  test('throws VIDEO_NOT_CONFIGURED when the lecture has no video_ref', async () => {
    await expect(bunnyProvider.getPlaybackConfig({ id: 1, videoRef: null }, null)).rejects.toMatchObject({
      code: 'VIDEO_NOT_CONFIGURED',
    });
  });

  test('getUploadInstructions mentions the configured library id and video_ref', () => {
    const instructions = bunnyProvider.getUploadInstructions({ id: 42 });
    expect(instructions.summary).toContain('759');
    expect(instructions.summary).toContain('video_ref');
    expect(instructions.lectureId).toBe(42);
  });
});

describe('bunny video adapter — validateRef (mocked HTTP layer)', () => {
  const original = {
    BUNNY_LIBRARY_ID: env.BUNNY_LIBRARY_ID,
    BUNNY_API_KEY: env.BUNNY_API_KEY,
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.BUNNY_LIBRARY_ID = '759';
    env.BUNNY_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    Object.assign(env, original);
    global.fetch = originalFetch;
  });

  test('calls the documented Get Video endpoint shape and returns true on a matching 200', async () => {
    let capturedUrl;
    let capturedHeaders;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return { ok: true, status: 200, json: async () => ({ guid: 'guid-abc', videoLibraryId: 759 }) };
    };

    const result = await bunnyProvider.validateRef('guid-abc');

    expect(result).toBe(true);
    expect(capturedUrl).toBe('https://video.bunnycdn.com/library/759/videos/guid-abc');
    expect(capturedHeaders).toEqual({ AccessKey: 'test-api-key' });
  });

  test('returns false on a definitive 404 (video not found)', async () => {
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const result = await bunnyProvider.validateRef('does-not-exist');
    expect(result).toBe(false);
  });

  test('returns false for an empty/undefined ref without calling the API', async () => {
    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    expect(await bunnyProvider.validateRef('')).toBe(false);
    expect(await bunnyProvider.validateRef(undefined)).toBe(false);
    expect(called).toBe(false);
  });

  test('throws VIDEO_PROVIDER_AUTH_ERROR on 401 (bad AccessKey) rather than reporting "not found"', async () => {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(bunnyProvider.validateRef('guid-abc')).rejects.toMatchObject({ code: 'VIDEO_PROVIDER_AUTH_ERROR' });
  });

  test('throws VIDEO_PROVIDER_UNREACHABLE on a network error', async () => {
    global.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(bunnyProvider.validateRef('guid-abc')).rejects.toMatchObject({ code: 'VIDEO_PROVIDER_UNREACHABLE' });
  });

  test('throws VIDEO_PROVIDER_MISCONFIGURED when BUNNY_LIBRARY_ID/BUNNY_API_KEY are unset', async () => {
    env.BUNNY_LIBRARY_ID = '';
    env.BUNNY_API_KEY = '';
    await expect(bunnyProvider.validateRef('guid-abc')).rejects.toMatchObject({ code: 'VIDEO_PROVIDER_MISCONFIGURED' });
  });
});
