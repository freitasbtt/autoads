import crypto from "node:crypto";
import type { Request } from "express";

const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PATH_PREFIXES = ["/api/public/"];
const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/health",
  "/api/webhooks/n8n/status",
]);

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken || req.session.csrfToken.trim().length === 0) {
    req.session.csrfToken = crypto.randomBytes(32).toString("base64url");
  }
  return req.session.csrfToken;
}

export function shouldSkipCsrfProtection(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return true;
  }

  if (EXEMPT_PATHS.has(req.path)) {
    return true;
  }

  return EXEMPT_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix));
}

export function validateCsrfToken(req: Request): {
  valid: boolean;
  status: number;
  message: string;
} {
  const expectedToken = req.session.csrfToken?.trim();
  if (!expectedToken) {
    return {
      valid: false,
      status: 403,
      message: "CSRF token missing from session",
    };
  }

  const providedToken = req.get(CSRF_HEADER_NAME)?.trim();
  if (!providedToken) {
    return {
      valid: false,
      status: 403,
      message: "Missing x-csrf-token header",
    };
  }

  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return {
      valid: false,
      status: 403,
      message: "Invalid CSRF token",
    };
  }

  return { valid: true, status: 200, message: "ok" };
}

