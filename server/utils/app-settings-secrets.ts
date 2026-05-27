import crypto from "node:crypto";
import type { AppSettings, InsertAppSettings } from "@shared/schema";

const APP_SETTINGS_SECRET_PREFIX = "enc.app.v1";
const APP_SETTINGS_SECRET_FIELDS = [
  "metaAppSecret",
  "googleClientSecret",
  "gcsServiceAccountJson",
] as const;

type AppSettingsSecretField = (typeof APP_SETTINGS_SECRET_FIELDS)[number];

let cachedAppSettingsKey: Buffer | null | undefined;

function getRawAppSettingsEncryptionKey() {
  return process.env.APP_SETTINGS_ENC_KEY?.trim() || process.env.META_TOKEN_ENC_KEY?.trim() || "";
}

function decodeKey(value: string, encoding: BufferEncoding): Buffer | null {
  try {
    const decoded = Buffer.from(value, encoding);
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function getAppSettingsEncryptionKey(): Buffer | null {
  if (cachedAppSettingsKey !== undefined) {
    return cachedAppSettingsKey;
  }

  const rawKey = getRawAppSettingsEncryptionKey();
  if (!rawKey) {
    cachedAppSettingsKey = null;
    return null;
  }

  const base64Key = decodeKey(rawKey, "base64");
  if (base64Key) {
    cachedAppSettingsKey = base64Key;
    return base64Key;
  }

  if (rawKey.length === 32) {
    const utf8Key = decodeKey(rawKey, "utf8");
    if (utf8Key) {
      cachedAppSettingsKey = utf8Key;
      return utf8Key;
    }
  }

  console.warn("APP_SETTINGS_ENC_KEY (or META_TOKEN_ENC_KEY fallback) must decode to exactly 32 bytes (AES-256).");
  cachedAppSettingsKey = null;
  return null;
}

function encryptSecretValue(value: string): string {
  if (!value) {
    return value;
  }

  const key = getAppSettingsEncryptionKey();
  if (!key) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    APP_SETTINGS_SECRET_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptSecretValue(value?: string | null): string | null {
  if (!value || value.length === 0) {
    return null;
  }

  if (!value.startsWith(`${APP_SETTINGS_SECRET_PREFIX}:`)) {
    return value;
  }

  const key = getAppSettingsEncryptionKey();
  if (!key) {
    console.error("Encrypted app setting stored but APP_SETTINGS_ENC_KEY is missing or invalid.");
    return null;
  }

  const [, ivB64, tagB64, payloadB64] = value.split(":");
  if (!ivB64 || !tagB64 || !payloadB64) {
    console.error("Invalid encrypted app setting format.");
    return null;
  }

  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const payload = Buffer.from(payloadB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("Failed to decrypt app setting secret:", err);
    return null;
  }
}

function transformSecretFields<T extends Partial<Record<AppSettingsSecretField, string | null | undefined>>>(
  value: T,
  transformer: (raw: string) => string | null,
): T {
  const transformed = { ...value };

  for (const field of APP_SETTINGS_SECRET_FIELDS) {
    if (!(field in transformed)) {
      continue;
    }

    const currentValue = transformed[field];
    if (typeof currentValue === "string") {
      transformed[field] = transformer(currentValue) as T[typeof field];
    } else if (currentValue == null) {
      transformed[field] = null as T[typeof field];
    }
  }

  return transformed;
}

export function decryptAppSettingsSecrets(settings?: AppSettings | undefined): AppSettings | undefined {
  if (!settings) {
    return settings;
  }

  return transformSecretFields(settings, (raw) => decryptSecretValue(raw));
}

export function encryptAppSettingsSecrets<T extends Partial<InsertAppSettings> | AppSettings>(settings: T): T {
  return transformSecretFields(settings, (raw) => encryptSecretValue(raw));
}

export function appSettingsSecretsNeedMigration(settings?: AppSettings | undefined): boolean {
  if (!settings || !getAppSettingsEncryptionKey()) {
    return false;
  }

  return APP_SETTINGS_SECRET_FIELDS.some((field) => {
    const value = settings[field];
    return typeof value === "string" && value.length > 0 && !value.startsWith(`${APP_SETTINGS_SECRET_PREFIX}:`);
  });
}

