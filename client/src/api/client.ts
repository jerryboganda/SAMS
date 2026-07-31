import { CONFIG } from "../config";
import { ApiResponseEnvelope } from "../types";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: any;

  constructor(message: string, code: string = "UNKNOWN_ERROR", status: number = 400, details?: any) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Fired on `window` whenever an authenticated call gets a 401 mid-session
 * (access token expired, refresh token revoked, an admin reset the caller's
 * devices, an explicit logout-all elsewhere, etc.). `authStore.tsx` listens
 * for this to clear its state — which, for anyone currently on a
 * `ProtectedRoute`, reactively soft-redirects to `/login` since
 * `isAuthenticated` flips to `false`. See DECISIONS.md 2026-07-31
 * (pre-Phase-5 session-security review).
 */
export const AUTH_SESSION_EXPIRED_EVENT = "sams:auth-session-expired";

interface ApiFetchOptions {
  /**
   * Set true for calls that legitimately expect a 401 as part of their own
   * normal, unauthenticated contract — login (bad credentials / 2FA
   * required), register, forgot/reset-password, email verification,
   * resend-verification, reverify, logout, and the auth bootstrap check
   * (`GET /auth/me` on app mount, when the visitor was never logged in).
   * None of those represent an existing session being revoked, so they must
   * NOT trigger `AUTH_SESSION_EXPIRED_EVENT`. Leave this false/omitted for
   * every other authenticated endpoint (dashboard, QBank, secure video,
   * admin mutations, etc.) so a 401 there is treated as "the session just
   * ended" and the app reacts.
   */
  skipAuthRedirect?: boolean;
}

function notifySessionExpired(error: ApiError): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT, { detail: error }));
}

/**
 * Standard typed API client unwrap function
 */
export async function apiFetch<T>(path: string, options?: RequestInit, fetchOpts?: ApiFetchOptions): Promise<T> {
  const url = `${CONFIG.API_BASE_URL}${path}`;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...(options?.headers || {}),
    },
  });

  const json: ApiResponseEnvelope<T> = await response.json().catch(() => ({
    success: false,
    data: null as any,
    error: {
      code: "INVALID_JSON",
      message: "Server returned invalid response format",
    },
  }));

  if (!response.ok || !json.success) {
    const errorMsg = json.error?.message || response.statusText || "Request failed";
    const errorCode = json.error?.code || `HTTP_${response.status}`;
    const apiError = new ApiError(errorMsg, errorCode, response.status, json.error?.details);

    if (response.status === 401 && !fetchOpts?.skipAuthRedirect) {
      notifySessionExpired(apiError);
    }

    throw apiError;
  }

  return json.data;
}

/**
 * Multipart upload variant of apiFetch — used by admin image uploads
 * (POST /admin/uploads/image, docs/04_API_SPEC.md §7). Deliberately does NOT
 * set a Content-Type header: the browser must set
 * `multipart/form-data; boundary=...` itself from the FormData body, which
 * apiFetch's hardcoded `application/json` header would otherwise clobber.
 */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const url = `${CONFIG.API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const json: ApiResponseEnvelope<T> = await response.json().catch(() => ({
    success: false,
    data: null as any,
    error: {
      code: "INVALID_JSON",
      message: "Server returned invalid response format",
    },
  }));

  if (!response.ok || !json.success) {
    const errorMsg = json.error?.message || response.statusText || "Request failed";
    const errorCode = json.error?.code || `HTTP_${response.status}`;
    const apiError = new ApiError(errorMsg, errorCode, response.status, json.error?.details);

    // apiUpload is only ever used for authenticated (admin) endpoints, so a
    // 401 here is always a real "session ended" signal — no skip option needed.
    if (response.status === 401) {
      notifySessionExpired(apiError);
    }

    throw apiError;
  }

  return json.data;
}

/**
 * Helper to simulate network latency for mock calls (300ms to 500ms by default)
 */
export function mockLatency<T>(result: T, delayMs: number = 350): Promise<T> {
  const isSlow = typeof window !== "undefined" && localStorage.getItem("sams_dev_slow_network") === "true";
  const actualDelay = isSlow ? delayMs + 2000 : delayMs;
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(result);
    }, actualDelay);
  });
}
