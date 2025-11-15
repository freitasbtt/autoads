import type { Request } from "express";

export function getPublicAppUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }

  const host = req.get("host");
  if (!host) {
    throw new Error("Unable to determine host for OAuth redirects");
  }

  return `${req.protocol}://${host}`;
}
