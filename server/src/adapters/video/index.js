// server/src/adapters/video/index.js
// VideoProvider factory (docs/02_ARCHITECTURE.md §6, docs/07_EXECUTION_PLAN.md
// 5.1). Picks the driver from env.VIDEO_PROVIDER ('mock' default per
// .env.example, or 'bunny'). Both drivers implement the same interface:
//   { name, getUploadInstructions(lecture), getPlaybackConfig(lecture, user), validateRef(videoRef) }
import { env } from '../../config/env.js';
import bunnyProvider from './bunny.js';
import mockProvider from './mock.js';

const PROVIDERS = {
  bunny: bunnyProvider,
  mock: mockProvider,
};

/** Resolve a VideoProvider driver by name (defaults to env.VIDEO_PROVIDER). */
export function getVideoProvider(providerName = env.VIDEO_PROVIDER) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`[video-adapter] Unknown VIDEO_PROVIDER "${providerName}". Valid: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  return provider;
}

// The driver selected by env.VIDEO_PROVIDER, resolved once at import time —
// what routes/services (Phase 5.2/5.3) should import for normal use.
// `getVideoProvider(name)` above remains available for tests / explicit
// driver selection.
export default getVideoProvider();
