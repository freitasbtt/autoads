import type { AppSettings } from "@shared/schema";

export function resolveMetaAppId(settings?: AppSettings | null): string | null {
  const envAppId = process.env.META_APP_ID?.trim();
  if (envAppId) {
    return envAppId;
  }

  const storedAppId = typeof settings?.metaAppId === "string" ? settings.metaAppId.trim() : "";
  return storedAppId.length > 0 ? storedAppId : null;
}

export function resolveMetaAppSecret(settings?: AppSettings | null): string | null {
  const envSecret = process.env.META_APP_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  const storedSecret =
    typeof settings?.metaAppSecret === "string" ? settings.metaAppSecret.trim() : "";
  return storedSecret.length > 0 ? storedSecret : null;
}
