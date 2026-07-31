import { describe, it, expect } from "vitest";
import { legalPathToPageKey } from "./legalPageUtils";

describe("legalPathToPageKey", () => {
  it("maps /terms to legal.terms", () => {
    expect(legalPathToPageKey("/terms")).toBe("legal.terms");
  });

  it("maps /privacy to legal.privacy", () => {
    expect(legalPathToPageKey("/privacy")).toBe("legal.privacy");
  });

  it("maps /refund to legal.refund", () => {
    expect(legalPathToPageKey("/refund")).toBe("legal.refund");
  });

  it("maps /refund-policy to legal.refund", () => {
    expect(legalPathToPageKey("/refund-policy")).toBe("legal.refund");
  });

  it("is case-insensitive", () => {
    expect(legalPathToPageKey("/PRIVACY")).toBe("legal.privacy");
  });

  it("defaults unknown paths to legal.terms", () => {
    expect(legalPathToPageKey("/something-else")).toBe("legal.terms");
  });
});
