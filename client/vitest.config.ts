import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname; // kept for parity with vite.config.ts's alias resolution base

// vite.config.ts exports a config *function* (Vite's `defineConfig(fn)`
// form). Call it the same way Vite itself does at dev/build time, then
// reuse its `resolve.alias` so tests resolve `@/...` imports identically
// to the real app build — single source of truth for the alias map.
const resolvedViteConfig =
  typeof viteConfig === 'function' ? viteConfig({ mode: 'test', command: 'serve' }) : viteConfig;

export default defineConfig({
  resolve: resolvedViteConfig.resolve,
  test: {
    environment: 'jsdom',
    globals: true,
    // No test files exist yet in this Phase-0 wiring step — don't fail the
    // run (and therefore `npm run verify`) just because the suite is empty.
    // Phase 3+ adds real vitest specs per docs/07_EXECUTION_PLAN.md.
    passWithNoTests: true,
  },
});
