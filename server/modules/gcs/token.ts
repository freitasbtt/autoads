import crypto from "crypto";

export function createStorageUploadPublicId(): string {
  return crypto.randomBytes(24).toString("base64url");
}
