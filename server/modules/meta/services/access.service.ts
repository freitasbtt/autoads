import { storage } from "../../storage";
import { decryptMetaAccessToken } from "../utils/token";
import { generateAppSecretProof } from "../utils/crypto";
import { resolveMetaAppSecret } from "../utils/app-config";

function parseExpiresAt(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === "number") {
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseExpiresIn(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseUpdatedAt(raw: unknown): number | null {
  if (raw instanceof Date) {
    return raw.getTime();
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function getMetaAccess(
  tenantId: number,
): Promise<{ accessToken: string; appSecretProof: string; expiresAt: number | null } | null> {
  const integration = await storage.getIntegrationByProvider(tenantId, "Meta");
  if (!integration) {
    return null;
  }

  const config = integration.config as Record<string, unknown>;
  const storedToken =
    typeof config?.accessToken === "string" ? config.accessToken : undefined;
  if (!storedToken) {
    return null;
  }

  const accessToken = decryptMetaAccessToken(storedToken);
  if (!accessToken) {
    return null;
  }

  const expiresIn = parseExpiresIn(config?.expiresIn);
  const updatedAt = parseUpdatedAt(integration.updatedAt) ?? Date.now();
  const fallbackExpiresAt =
    typeof expiresIn === "number" ? updatedAt + expiresIn * 1000 : null;

  const expiresAt = parseExpiresAt(config?.expiresAt) ?? fallbackExpiresAt;
  if (!expiresAt) {
    console.warn("Meta access token missing expiresAt; requiring re-auth", {
      tenantId,
      integrationId: integration.id,
    });
    return null;
  }

  if (Date.now() >= expiresAt) {
    console.warn("Meta access token expired; requiring re-auth", {
      tenantId,
      integrationId: integration.id,
      expiresAt,
    });
    return null;
  }

  const settings = await storage.getAppSettings();
  const metaAppSecret = resolveMetaAppSecret(settings);
  if (!metaAppSecret) {
    console.warn("Meta app secret missing; cannot generate appsecret_proof", {
      tenantId,
      integrationId: integration.id,
    });
    return null;
  }

  const appSecretProof = generateAppSecretProof(accessToken, metaAppSecret);

  return { accessToken, appSecretProof, expiresAt };
}
