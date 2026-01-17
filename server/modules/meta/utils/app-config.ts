import type { AppSettings } from "@shared/schema";

export function resolveMetaAppSecret(settings?: AppSettings | null): string | null {
  const envSecret = process.env.META_APP_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  const storedSecret =
    typeof settings?.metaAppSecret === "string" ? settings.metaAppSecret.trim() : "";
  return storedSecret.length > 0 ? storedSecret : null;
}
