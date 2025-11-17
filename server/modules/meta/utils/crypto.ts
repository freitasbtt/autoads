import crypto from "crypto";

export function generateAppSecretProof(
  accessToken: string,
  appSecret: string,
): string {
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
