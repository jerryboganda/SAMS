// server/src/start.cjs
// Hostinger-platform compatibility shim — NOT part of the application logic.
//
// Why this file exists: Hostinger's managed Node.js runner invokes the
// configured "Entry file" via require(), not `node <entry>` directly (a
// Passenger-style process-supervisor pattern common to managed Node
// hosting). Node 20+ can synchronously require() a plain ESM module for
// exactly this kind of interop — EXCEPT when the ESM module graph contains
// genuine top-level await anywhere in it, which throws
// `ERR_REQUIRE_ASYNC_MODULE: require() cannot be used on an ESM graph with
// top-level await` (confirmed live in Hostinger's runtime logs for this app
// — some dependency in server/src/index.js's import graph uses top-level
// await). This is a real Node.js platform limitation, not a bug in this
// codebase's own source (server/src/index.js itself has no top-level
// await — see its own header comment).
//
// The fix: this file is plain CommonJS (`.cjs` extension — always CJS
// regardless of server/package.json's "type":"module"), so Hostinger's
// require() call succeeds trivially. It then loads the REAL entry point via
// a dynamic import() rather than require() — dynamic import() is exempt
// from the top-level-await restriction above (it returns a Promise, which
// is exactly the async escape hatch require() doesn't have). This changes
// nothing about how the app actually boots; it is a pure loader shim.
//
// Local dev / `npm start` / `npm run smoke` are UNCHANGED — they still run
// `node server/src/index.js` directly (see root package.json's "start"
// script and server/scripts/smoke/prodSmoke.js), which never goes through
// require() at all, so this file is never invoked outside Hostinger's own
// managed-runner entry-file setting.
import('./index.js').catch((err) => {
  // eslint-disable-next-line no-console -- this fires before winston's
  // logger.js could plausibly have finished loading; console.error is the
  // only guaranteed-available sink at this point.
  console.error('[start.cjs] fatal error loading server/src/index.js:', err);
  process.exit(1);
});
