import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, AUTH_SESSION_EXPIRED_EVENT } from "./client";

/**
 * Covers the global mid-session 401 handling added alongside the
 * `authStore.tsx` session-bootstrap fix (2026-07-31, pre-Phase-5 review —
 * see DECISIONS.md). This is the one piece of that fix that's cleanly
 * unit-testable in isolation: `apiFetch` dispatching (or not dispatching)
 * `AUTH_SESSION_EXPIRED_EVENT` on `window` based on response status and the
 * caller-supplied `skipAuthRedirect` flag. The React-side reaction to that
 * event (authStore.tsx clearing state, ProtectedRoute redirecting) is an
 * effect/integration concern better covered by the manual `agent-browser`
 * verification described in DECISIONS.md than by a low-value mocked-render
 * test — no React Testing Library is installed in this project, and adding
 * one just for this would be a disproportionate dependency for one test.
 */

function mockJsonResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

describe("apiFetch — global session-expired signaling", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let eventSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
    eventSpy = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, eventSpy);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, eventSpy);
  });

  it("resolves with the envelope's data on a successful response", async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ success: true, data: { id: 1 } }, 200));

    const result = await apiFetch<{ id: number }>("/ping");

    expect(result).toEqual({ id: 1 });
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("throws ApiError with the envelope's code/status on failure", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: { code: "NOT_FOUND", message: "Missing" } }, 404)
    );

    await expect(apiFetch("/missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "Missing",
    });
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("dispatches AUTH_SESSION_EXPIRED_EVENT on a 401 by default (mid-session call)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Session expired" } }, 401)
    );

    await expect(apiFetch("/student/dashboard")).rejects.toBeInstanceOf(ApiError);

    expect(eventSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT dispatch AUTH_SESSION_EXPIRED_EVENT on a 401 when skipAuthRedirect is set (e.g. login/bootstrap)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Bad login" } }, 401)
    );

    await expect(apiFetch("/auth/login", undefined, { skipAuthRedirect: true })).rejects.toBeInstanceOf(ApiError);

    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("does not dispatch AUTH_SESSION_EXPIRED_EVENT for non-401 failures", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ success: false, error: { code: "SERVER_ERROR", message: "Boom" } }, 500)
    );

    await expect(apiFetch("/anything")).rejects.toBeInstanceOf(ApiError);

    expect(eventSpy).not.toHaveBeenCalled();
  });
});
