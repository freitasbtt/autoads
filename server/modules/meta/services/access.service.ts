import { storage } from "../../storage";
import { decryptMetaAccessToken } from "../utils/token";
import { generateAppSecretProof } from "../utils/crypto";

export async function getMetaAccess(
  tenantId: number,
): Promise<{ accessToken: string; appSecretProof?: string } | null> {
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

  const settings = await storage.getAppSettings();
  const appSecretProof =
    settings?.metaAppSecret && settings.metaAppSecret.length > 0
      ? generateAppSecretProof(accessToken, settings.metaAppSecret)
      : undefined;

  return { accessToken, appSecretProof };
}
