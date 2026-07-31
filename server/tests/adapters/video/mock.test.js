// server/tests/adapters/video/mock.test.js
// Unit + integration tests for the `mock` VideoProvider driver
// (docs/07_EXECUTION_PLAN.md 5.1, AC: "mock returns playable URL").
import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { sequelize } from '../../../src/db/sequelize.js';
import mockProvider, { MOCK_ASSET_PATH } from '../../../src/adapters/video/mock.js';
import { MAX_EXPIRY_SECONDS } from '../../../src/adapters/video/bunny.js';

afterAll(async () => {
  await sequelize.close();
});

describe('mock video adapter — interface contract', () => {
  test('name is "mock"', () => {
    expect(mockProvider.name).toBe('mock');
  });

  test('getPlaybackConfig returns a playable local URL with a future expiresAt, zero credentials required', async () => {
    const before = Date.now();
    const config = await mockProvider.getPlaybackConfig({ id: 1, videoRef: null }, null);

    expect(config.type).toBe('mp4');
    expect(config.url).toBe(MOCK_ASSET_PATH);
    expect(new Date(config.expiresAt).getTime()).toBeGreaterThan(before);
    // Consistent with the bunny driver's ≤6h policy, not an arbitrary far-future value.
    expect(new Date(config.expiresAt).getTime() - before).toBeLessThanOrEqual(MAX_EXPIRY_SECONDS * 1000 + 1000);
  });

  test('getPlaybackConfig ignores video_ref entirely — same URL for every lecture', async () => {
    const a = await mockProvider.getPlaybackConfig({ id: 1, videoRef: null }, null);
    const b = await mockProvider.getPlaybackConfig({ id: 2, videoRef: 'anything' }, null);
    expect(a.url).toBe(b.url);
  });

  test('validateRef is true iff a non-empty ref string was provided (no real backend to check)', async () => {
    expect(await mockProvider.validateRef('mock')).toBe(true);
    expect(await mockProvider.validateRef('')).toBe(false);
    expect(await mockProvider.validateRef(undefined)).toBe(false);
    expect(await mockProvider.validateRef(null)).toBe(false);
  });

  test('getUploadInstructions explains the zero-upload mock behavior', () => {
    const instructions = mockProvider.getUploadInstructions({ id: 7 });
    expect(instructions.summary.toLowerCase()).toContain('no upload needed');
    expect(instructions.lectureId).toBe(7);
  });
});

describe('mock video adapter — dev-asset route is actually reachable (server/src/app.js)', () => {
  test(`GET ${MOCK_ASSET_PATH} serves the sample video with a 200 and a video content-type`, async () => {
    const res = await request(app).get(MOCK_ASSET_PATH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^video\//);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  test('a nonexistent dev-asset path 404s rather than falling through to the SPA index.html', async () => {
    const res = await request(app).get('/dev-assets/does-not-exist.mp4');
    expect(res.status).toBe(404);
  });
});
