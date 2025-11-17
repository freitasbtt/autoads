import crypto from "crypto";

const META_TOKEN_ENC_PREFIX = "enc.v1";
let cachedMetaTokenKey: Buffer | null | undefined;

function getMetaTokenEncryptionKey(): Buffer | null {
  if (cachedMetaTokenKey !== undefined) {
    return cachedMetaTokenKey;
  }

  const rawKey = process.env.META_TOKEN_ENC_KEY?.trim();
  if (!rawKey) {
    cachedMetaTokenKey = null;
    return null;
  }

  const tryDecode = (value: string, encoding: BufferEncoding): Buffer | null => {
    try {
      const decoded = Buffer.from(value, encoding);
      return decoded.length === 32 ? decoded : null;
    } catch {
      return null;
    }
  };

  const base64Key = tryDecode(rawKey, "base64");
  if (base64Key) {
    cachedMetaTokenKey = base64Key;
    return base64Key;
  }

  if (rawKey.length === 32) {
    const utf8Key = tryDecode(rawKey, "utf8");
    if (utf8Key) {
      cachedMetaTokenKey = utf8Key;
      return utf8Key;
    }
  }

  console.warn("META_TOKEN_ENC_KEY must decode to exactly 32 bytes (AES-256).");
  cachedMetaTokenKey = null;
  return null;
}

export function encryptMetaAccessToken(token: string): string {
  if (!token) {
    return token;
  }
  const key = getMetaTokenEncryptionKey();
  if (!key) {
    return token;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    META_TOKEN_ENC_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptMetaAccessToken(token?: string | null): string | null {
  if (!token || token.length === 0) {
    return null;
  }
  if (!token.startsWith(`${META_TOKEN_ENC_PREFIX}:`)) {
    return token;
  }
  const key = getMetaTokenEncryptionKey();
  if (!key) {
    console.error("Encrypted Meta token stored but META_TOKEN_ENC_KEY is missing or invalid.");
    return null;
  }
  const [, ivB64, tagB64, payloadB64] = token.split(":");
  if (!ivB64 || !tagB64 || !payloadB64) {
    console.error("Invalid encrypted Meta token format.");
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
    console.error("Failed to decrypt Meta token:", err);
    return null;
  }
}
