import { describe, it, expect } from "vitest";
import { resolveLoginErrorScreen } from "./loginErrorScreen";

describe("resolveLoginErrorScreen", () => {
  it("routes ACCOUNT_LOCKED to the locked screen even though it shares HTTP 423 with DEVICE_LIMIT_REACHED", () => {
    expect(resolveLoginErrorScreen("ACCOUNT_LOCKED", 423)).toBe("locked");
  });

  it("routes DEVICE_LIMIT_REACHED to the device_limit screen", () => {
    expect(resolveLoginErrorScreen("DEVICE_LIMIT_REACHED", 423)).toBe("device_limit");
  });

  it("routes TWOFA_REQUIRED to the totp screen", () => {
    expect(resolveLoginErrorScreen("TWOFA_REQUIRED", 401)).toBe("totp");
  });

  it("does not recognize the old (wrong) REQUIRES_2FA code", () => {
    expect(resolveLoginErrorScreen("REQUIRES_2FA", 401)).toBeNull();
  });

  it("routes REVERIFY_REQUIRED to the suspicious screen", () => {
    expect(resolveLoginErrorScreen("REVERIFY_REQUIRED", 401)).toBe("suspicious");
  });

  it("routes EMAIL_NOT_VERIFIED to the email_unverified screen", () => {
    expect(resolveLoginErrorScreen("EMAIL_NOT_VERIFIED", 403)).toBe("email_unverified");
  });

  it("falls back to device_limit for an unrecognized 423 status", () => {
    expect(resolveLoginErrorScreen("SOME_NEW_423_CODE", 423)).toBe("device_limit");
  });

  it("returns null for a plain invalid-credentials error", () => {
    expect(resolveLoginErrorScreen("INVALID_CREDENTIALS", 401)).toBeNull();
  });

  it("returns null when there is no code or status", () => {
    expect(resolveLoginErrorScreen(undefined, undefined)).toBeNull();
  });
});
