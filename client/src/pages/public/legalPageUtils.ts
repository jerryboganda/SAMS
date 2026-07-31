import { PageKey } from "../../api/endpoints/public";

/**
 * Maps a route pathname (/terms, /privacy, /refund, /refund-policy, ...) to
 * the Settings-backed page key the real `GET /public/pages/:key` endpoint
 * expects (server/src/config/constants.js PUBLIC_PAGE_KEYS). Pulled out as a
 * pure function so LegalPage's routing logic is unit-testable without
 * mounting the page (client/src/pages/public/legalPageUtils.test.ts).
 */
export function legalPathToPageKey(pathname: string): PageKey {
  const path = pathname.toLowerCase();
  if (path.includes("privacy")) return "legal.privacy";
  if (path.includes("refund")) return "legal.refund";
  return "legal.terms";
}
