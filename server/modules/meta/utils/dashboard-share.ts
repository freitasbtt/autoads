import crypto from "crypto";
import { z } from "zod";

const dashboardShareClaimsSchema = z.object({
  v: z.literal(1),
  tenantId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountIds: z.array(z.number().int().positive()).min(1),
  campaignId: z.string().min(1).nullable().optional(),
  objective: z.string().min(1).nullable().optional(),
  status: z.string().min(1).nullable().optional(),
  expiresAt: z.string().datetime(),
});

export type DashboardShareClaims = z.infer<typeof dashboardShareClaimsSchema>;

function getDashboardShareSecret(): string {
  const secret = process.env.DASHBOARD_SHARE_SECRET ?? process.env.SESSION_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("Dashboard share secret not configured.");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getDashboardShareSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createDashboardShareToken(
  claims: Omit<DashboardShareClaims, "v">,
): string {
  const payload = encodeBase64Url(
    JSON.stringify({
      v: 1,
      ...claims,
    } satisfies DashboardShareClaims),
  );
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyDashboardShareToken(token: string): DashboardShareClaims {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    throw new Error("Invalid dashboard share token.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid dashboard share token signature.");
  }

  const parsed = dashboardShareClaimsSchema.parse(
    JSON.parse(decodeBase64Url(encodedPayload)),
  );

  if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
    throw new Error("Dashboard share token expired.");
  }

  return parsed;
}
