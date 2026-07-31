// server/tests/adapters/video/index.test.js
// VideoProvider factory (docs/07_EXECUTION_PLAN.md 5.1): picks the driver
// from env.VIDEO_PROVIDER ('mock' default per .env.example, or 'bunny').
import { describe, expect, test } from '@jest/globals';
import defaultProvider, { getVideoProvider } from '../../../src/adapters/video/index.js';
import bunnyProvider from '../../../src/adapters/video/bunny.js';
import mockProvider from '../../../src/adapters/video/mock.js';

describe('video adapter factory', () => {
  test('default export resolves to the `mock` driver (env.VIDEO_PROVIDER default per .env.example)', () => {
    expect(defaultProvider.name).toBe('mock');
    expect(defaultProvider).toBe(mockProvider);
  });

  test('getVideoProvider("mock") / getVideoProvider("bunny") return the matching, interface-conformant drivers', () => {
    const mock = getVideoProvider('mock');
    const bunny = getVideoProvider('bunny');

    expect(mock).toBe(mockProvider);
    expect(bunny).toBe(bunnyProvider);

    for (const provider of [mock, bunny]) {
      expect(typeof provider.name).toBe('string');
      expect(typeof provider.getUploadInstructions).toBe('function');
      expect(typeof provider.getPlaybackConfig).toBe('function');
      expect(typeof provider.validateRef).toBe('function');
    }
  });

  test('an unknown provider name throws rather than silently falling back', () => {
    expect(() => getVideoProvider('not-a-real-provider')).toThrow(/Unknown VIDEO_PROVIDER/);
  });
});
