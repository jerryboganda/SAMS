/**
 * Maps a POST /auth/login (or /auth/reverify) ApiError to the LoginPage
 * screen that should handle it. Pulled out as a pure function so the
 * branching logic is unit-testable without mounting the page component
 * (client/src/pages/public/loginErrorScreen.test.ts).
 *
 * Error codes match docs/04_API_SPEC.md §1 / server/src/services/authService.js
 * exactly. Two of them (`DEVICE_LIMIT_REACHED` and `ACCOUNT_LOCKED`) both use
 * HTTP 423 — code must be checked before falling back to status, otherwise a
 * locked account gets misrouted to the device-limit screen (the bug in the
 * original AI-Studio-exported LoginPage.tsx, which only ever checked
 * `err.status === 423` first; see DECISIONS.md 2026-07-31 Phase 3.2-3.4).
 */
export type LoginErrorScreen = "device_limit" | "totp" | "suspicious" | "locked" | "email_unverified" | null;

export function resolveLoginErrorScreen(code?: string, status?: number): LoginErrorScreen {
  if (code === "ACCOUNT_LOCKED") return "locked";
  if (code === "DEVICE_LIMIT_REACHED") return "device_limit";
  if (code === "TWOFA_REQUIRED") return "totp";
  if (code === "REVERIFY_REQUIRED") return "suspicious";
  if (code === "EMAIL_NOT_VERIFIED") return "email_unverified";
  // Unrecognized error carrying a 423 status: still treat as a device-limit
  // style block rather than falling through to a generic message.
  if (status === 423) return "device_limit";
  return null;
}
