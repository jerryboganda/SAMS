import { describe, it, expect } from "vitest";
import {
  computeNextHeartbeatDelayMs,
  shouldTriggerTakeover,
  computeWatermarkPosition,
  computeMsUntilTokenRefresh,
  shouldShowResumeNotice,
  inferAlreadyCompletedFromResume,
  formatPlayerTime,
  formatWatermarkTimestamp,
  HEARTBEAT_BASE_INTERVAL_MS,
  HEARTBEAT_MAX_INTERVAL_MS,
  TOKEN_REFRESH_BUFFER_MS,
  TOKEN_REFRESH_MIN_DELAY_MS,
} from "./playerLogic";

describe("computeNextHeartbeatDelayMs (heartbeat backoff scheduling)", () => {
  it("uses the base interval with zero failures", () => {
    expect(computeNextHeartbeatDelayMs(0)).toBe(HEARTBEAT_BASE_INTERVAL_MS);
  });

  it("doubles per consecutive failure", () => {
    expect(computeNextHeartbeatDelayMs(1)).toBe(HEARTBEAT_BASE_INTERVAL_MS * 2);
    expect(computeNextHeartbeatDelayMs(2)).toBe(HEARTBEAT_BASE_INTERVAL_MS * 4);
    expect(computeNextHeartbeatDelayMs(3)).toBe(HEARTBEAT_BASE_INTERVAL_MS * 8);
  });

  it("caps at the max interval and never exceeds it for large failure counts", () => {
    expect(computeNextHeartbeatDelayMs(3)).toBe(HEARTBEAT_MAX_INTERVAL_MS); // 15s*8=120s, exactly the cap
    expect(computeNextHeartbeatDelayMs(10)).toBe(HEARTBEAT_MAX_INTERVAL_MS);
    expect(computeNextHeartbeatDelayMs(1000)).toBe(HEARTBEAT_MAX_INTERVAL_MS);
  });

  it("treats negative/non-finite failure counts as zero (defensive)", () => {
    expect(computeNextHeartbeatDelayMs(-5)).toBe(HEARTBEAT_BASE_INTERVAL_MS);
    expect(computeNextHeartbeatDelayMs(NaN)).toBe(HEARTBEAT_BASE_INTERVAL_MS);
  });

  it("honors custom base/max overrides", () => {
    expect(computeNextHeartbeatDelayMs(1, 1000, 5000)).toBe(2000);
    expect(computeNextHeartbeatDelayMs(5, 1000, 5000)).toBe(5000);
  });
});

describe("shouldTriggerTakeover (409 STREAM_TAKEN_OVER state transition)", () => {
  it("is true on HTTP 409 regardless of code", () => {
    expect(shouldTriggerTakeover(409, undefined)).toBe(true);
    expect(shouldTriggerTakeover(409, "SOMETHING_ELSE")).toBe(true);
  });

  it("is true on the STREAM_TAKEN_OVER code regardless of status", () => {
    expect(shouldTriggerTakeover(undefined, "STREAM_TAKEN_OVER")).toBe(true);
    expect(shouldTriggerTakeover(500, "STREAM_TAKEN_OVER")).toBe(true);
  });

  it("is false for unrelated errors (e.g. a transient 500 or 401)", () => {
    expect(shouldTriggerTakeover(500, "INTERNAL_ERROR")).toBe(false);
    expect(shouldTriggerTakeover(401, "UNAUTHENTICATED")).toBe(false);
    expect(shouldTriggerTakeover(undefined, undefined)).toBe(false);
  });
});

describe("computeWatermarkPosition (watermark reposition scheduler)", () => {
  it("stays within the documented quadrant bounds across the RNG's full range", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.999999];
    for (const s of samples) {
      const { top, left } = computeWatermarkPosition(() => s);
      const topPct = Number(top.replace("%", ""));
      const leftPct = Number(left.replace("%", ""));
      expect(topPct).toBeGreaterThanOrEqual(10);
      expect(topPct).toBeLessThanOrEqual(75);
      expect(leftPct).toBeGreaterThanOrEqual(10);
      expect(leftPct).toBeLessThanOrEqual(70);
    }
  });

  it("is deterministic for a given RNG output", () => {
    const pos = computeWatermarkPosition(() => 0.5);
    expect(pos).toEqual({ top: "42%", left: "40%" });
  });

  it("produces different positions for different RNG outputs (actually moves)", () => {
    const a = computeWatermarkPosition(() => 0.1);
    const b = computeWatermarkPosition(() => 0.9);
    expect(a).not.toEqual(b);
  });
});

describe("computeMsUntilTokenRefresh (playback token refresh scheduling)", () => {
  it("schedules the buffer window before expiry under normal conditions", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + 10 * 60_000).toISOString(); // 10 min out
    const delay = computeMsUntilTokenRefresh(expiresAt, now);
    expect(delay).toBe(10 * 60_000 - TOKEN_REFRESH_BUFFER_MS);
  });

  it("clamps to the minimum delay when expiry is already within the buffer window", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + 10_000).toISOString(); // 10s out, less than the 60s buffer
    expect(computeMsUntilTokenRefresh(expiresAt, now)).toBe(TOKEN_REFRESH_MIN_DELAY_MS);
  });

  it("clamps to the minimum delay when expiry is already in the past", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now - 60_000).toISOString();
    expect(computeMsUntilTokenRefresh(expiresAt, now)).toBe(TOKEN_REFRESH_MIN_DELAY_MS);
  });

  it("clamps to the minimum delay on an invalid expiresAt string", () => {
    expect(computeMsUntilTokenRefresh("not-a-date", 1_000_000)).toBe(TOKEN_REFRESH_MIN_DELAY_MS);
  });
});

describe("shouldShowResumeNotice", () => {
  it("is false for a fresh start or a trivially small resume position", () => {
    expect(shouldShowResumeNotice(0)).toBe(false);
    expect(shouldShowResumeNotice(2)).toBe(false);
  });

  it("is true once at/above the minimum threshold", () => {
    expect(shouldShowResumeNotice(5)).toBe(true);
    expect(shouldShowResumeNotice(120)).toBe(true);
  });
});

describe("inferAlreadyCompletedFromResume", () => {
  it("infers completion once resume position is within 90% of duration", () => {
    expect(inferAlreadyCompletedFromResume(950, 1000)).toBe(true);
    expect(inferAlreadyCompletedFromResume(900, 1000)).toBe(true);
  });

  it("does not infer completion below the 90% threshold", () => {
    expect(inferAlreadyCompletedFromResume(500, 1000)).toBe(false);
    expect(inferAlreadyCompletedFromResume(899, 1000)).toBe(false);
  });

  it("is false when duration is unknown/zero (nothing to divide by)", () => {
    expect(inferAlreadyCompletedFromResume(500, 0)).toBe(false);
    expect(inferAlreadyCompletedFromResume(500, undefined)).toBe(false);
  });

  it("is false for a zero/negative resume position", () => {
    expect(inferAlreadyCompletedFromResume(0, 1000)).toBe(false);
  });
});

describe("formatPlayerTime", () => {
  it("formats sub-hour durations as mm:ss", () => {
    expect(formatPlayerTime(0)).toBe("00:00");
    expect(formatPlayerTime(65)).toBe("01:05");
    expect(formatPlayerTime(599)).toBe("09:59");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatPlayerTime(3661)).toBe("1:01:01");
  });

  it("falls back to 00:00 for invalid input", () => {
    expect(formatPlayerTime(NaN)).toBe("00:00");
    expect(formatPlayerTime(-5)).toBe("00:00");
  });
});

describe("formatWatermarkTimestamp", () => {
  it("returns an empty string for missing/invalid input", () => {
    expect(formatWatermarkTimestamp(undefined)).toBe("");
    expect(formatWatermarkTimestamp("not-a-date")).toBe("");
  });

  it("formats a valid ISO timestamp into a non-empty, readable string", () => {
    const label = formatWatermarkTimestamp("2026-07-31T12:34:56.000Z");
    expect(label.length).toBeGreaterThan(0);
    // Loosely assert shape rather than an exact locale-dependent string —
    // must contain a month abbreviation and a colon-separated time.
    expect(label).toMatch(/[A-Za-z]{3}/);
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });
});
