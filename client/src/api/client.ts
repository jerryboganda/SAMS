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
 * Standard typed API client unwrap function
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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
    throw new ApiError(errorMsg, errorCode, response.status, json.error?.details);
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
