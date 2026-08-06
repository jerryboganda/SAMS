import React, { createContext, useContext, useState, useEffect } from "react";
import { User, UserRole } from "../types";
import { authApi, LoginRequest } from "../api/endpoints/auth";
import { ApiError, AUTH_SESSION_EXPIRED_EVENT } from "../api/client";
import { CONFIG } from "../config";

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True from mount until the initial `GET /auth/me` session-bootstrap
   * check (see the `AuthProvider` effect below) has resolved. The real
   * session lives in httpOnly cookies, not anything readable client-side —
   * `isAuthenticated` is only trustworthy once this flips to `false`.
   * `ProtectedRoute` renders a loading state instead of redirecting while
   * this is `true`, so an expired/revoked session isn't mistaken for "not
   * logged in yet" and a valid one doesn't briefly flash a logged-out UI.
   */
  isBootstrapping: boolean;
  /**
   * Set when a mid-session API call comes back 401 (see
   * `AUTH_SESSION_EXPIRED_EVENT` in `api/client.ts`) — i.e. the session was
   * valid a moment ago and just ended (token expiry, logout-all elsewhere,
   * an admin device reset, account suspension). `LoginPage` surfaces this as
   * a banner so the resulting redirect doesn't look like a silent failure.
   * Cleared by `clearErrors()`.
   */
  sessionExpiredMessage: string | null;
  deviceLimitError: { message: string } | null;
  requires2FA: boolean;
  login: (emailOrReq: string | LoginRequest, passwordArg?: string) => Promise<User>;
  verify2FA: (code: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (updated: Partial<User>) => void;
  clearErrors: () => void;
  /**
   * Commits an already-completed login response (user + token) into auth
   * state without re-submitting credentials — for flows that call an
   * `authApi` method other than `login()`/`verify2FA()` directly (e.g. the
   * suspicious-login email reverify step, `POST /auth/reverify`) but still
   * need the resulting session reflected in `useAuth()` so `isAuthenticated`
   * / `user.role` are correct for route guards like ProtectedRoute
   * immediately afterward.
   */
  completeExternalLogin: (user: User, token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local cache of the last-known user object only, for a flash-free first
// paint — NEVER the source of truth. The real session lives entirely in
// httpOnly `access_token`/`refresh_token` cookies the browser sends
// automatically (`apiFetch`'s `credentials: "include"`); this cache is
// reconciled against `GET /auth/me` in the bootstrap effect below on every
// app mount, and overwritten/cleared based on that server response.
const AUTH_STORAGE_KEY = "sams_mock_auth_user";
// NOTE: a `sams_mock_auth_token` bearer-token cache used to be written
// alongside AUTH_STORAGE_KEY here. Removed 2026-07-31 (pre-Phase-5 session
// review): verified nothing in `client/src` ever reads it back or sends it
// as an `Authorization` header — the real backend's login response only
// includes a `token` field to satisfy this pre-existing frontend's
// `LoginResponse` shape (`server/src/services/authService.js`'s
// `completeLoginSession` literally returns the non-secret placeholder
// `'issued'`, by design). It was dead, misleading weight. See DECISIONS.md.

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Starts true: nothing has confirmed the cached `user` above still matches
  // a live server-side session. Flips false once the bootstrap effect below
  // resolves (success or 401 alike) — see the interface doc comment.
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [deviceLimitError, setDeviceLimitError] = useState<{ message: string } | null>(null);
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  // Retained only in memory (never persisted) so a completed TWOFA_REQUIRED
  // challenge can resubmit POST /auth/login with {email,password,twofaCode}
  // — the real backend has no separate 2FA-verify endpoint that would let
  // us avoid re-sending the password (see client/src/api/endpoints/auth.ts
  // and DECISIONS.md 2026-07-31 Phase 3.2-3.4).
  const [pendingPassword, setPendingPassword] = useState<string>("");

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  // Session bootstrap: reconcile the localStorage-cached `user` (UX
  // optimization only) against the real, cookie-backed server session once,
  // on mount, before any `ProtectedRoute` should be trusted to redirect.
  useEffect(() => {
    let cancelled = false;

    if (CONFIG.USE_MOCK) {
      // Mock mode has no real cookie session to reconcile against, and the
      // mock `getCurrentUser()` auto-returns a demo user for guests (by
      // design, for the mock demo flow) — calling it here would silently
      // "log in" every anonymous mock visitor. The localStorage cache read
      // into initial state above is authoritative in mock mode, unchanged
      // from pre-existing behavior.
      setIsBootstrapping(false);
      return;
    }

    (async () => {
      try {
        const currentUser = await authApi.getCurrentUser({ skipAuthRedirect: true });
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        // No valid session (never logged in, expired, or revoked) — this is
        // the normal "logged out" outcome, not an error. Same end-state as
        // an explicit logout.
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Global mid-session 401 handler (see AUTH_SESSION_EXPIRED_EVENT in
  // api/client.ts): a previously-valid session just ended (token expiry,
  // logout-all elsewhere, admin device reset, account suspension). Clear
  // local state to the same end-state as an explicit logout; any
  // `ProtectedRoute` currently rendered reacts to `isAuthenticated` flipping
  // false and soft-redirects to /login on its own (no direct router access
  // needed here — AuthProvider sits above BrowserRouter in main.tsx).
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setSessionExpiredMessage("Your session has ended. Please sign in again to continue.");
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const clearErrors = () => {
    setDeviceLimitError(null);
    setRequires2FA(false);
    setSessionExpiredMessage(null);
  };

  const login = async (emailOrReq: string | LoginRequest, passwordArg?: string): Promise<User> => {
    setIsLoading(true);
    clearErrors();

    const req: LoginRequest =
      typeof emailOrReq === "string"
        ? { email: emailOrReq, password: passwordArg || "" }
        : emailOrReq;

    try {
      const response = await authApi.login(req);

      if (response.user) {
        setUser(response.user);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(response.user));
        return response.user;
      }

      throw new ApiError("Login failed", "AUTH_FAILED");
    } catch (err: any) {
      if (err.code === "DEVICE_LIMIT_REACHED" || err.status === 423) {
        setDeviceLimitError({
          message: err.message || "Account is active on another primary device (423 DEVICE_LIMIT_REACHED).",
        });
      } else if (err.code === "TWOFA_REQUIRED") {
        setRequires2FA(true);
        setPendingEmail(req.email);
        setPendingPassword(req.password);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verify2FA = async (code: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.verify2FA(pendingEmail, pendingPassword, code);
      setUser(res.user);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res.user));
      setRequires2FA(false);
      setPendingPassword("");
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setIsLoading(false);
    }
  };

  const updateUser = (updated: Partial<User>) => {
    if (user) {
      const next = { ...user, ...updated };
      setUser(next);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    }
  };

  const completeExternalLogin = (nextUser: User, token: string) => {
    // `token` kept in the signature to match the `{user, token}` shape every
    // `authApi` login-completing call returns (see the TOKEN_STORAGE_KEY
    // removal note above for why it's intentionally never persisted).
    void token;
    setUser(nextUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    clearErrors();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        isAuthenticated: !!user,
        isLoading,
        isBootstrapping,
        sessionExpiredMessage,
        deviceLimitError,
        requires2FA,
        login,
        verify2FA,
        logout,
        updateUser,
        clearErrors,
        completeExternalLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
