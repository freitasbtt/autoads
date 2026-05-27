import { Router } from "express";
import type { User, InsertIntegration, Integration } from "@shared/schema";
import { insertIntegrationSchema } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";
import { decryptMetaAccessToken } from "../meta/utils/token";
import { generateAppSecretProof } from "../meta/utils/crypto";
import { revokeMetaAccessToken } from "../meta/services/revoke.service";
import { resolveMetaAppSecret } from "../meta/utils/app-config";

export const integrationsRouter = Router();

integrationsRouter.use(isAuthenticated);

function serializeIntegration(integration: Integration) {
  const config = (integration.config ?? {}) as Record<string, unknown>;

  return {
    id: integration.id,
    tenantId: integration.tenantId,
    provider: integration.provider,
    status: integration.status,
    lastChecked: integration.lastChecked,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    config: {
      accountName:
        typeof config.accountName === "string" && config.accountName.trim().length > 0
          ? config.accountName.trim()
          : null,
      email:
        typeof config.email === "string" && config.email.trim().length > 0
          ? config.email.trim()
          : null,
      tokenType:
        typeof config.tokenType === "string" && config.tokenType.trim().length > 0
          ? config.tokenType.trim()
          : null,
      expiresAt:
        typeof config.expiresAt === "number" || typeof config.expiresAt === "string"
          ? config.expiresAt
          : null,
      expiresIn:
        typeof config.expiresIn === "number" || typeof config.expiresIn === "string"
          ? config.expiresIn
          : null,
      hasAccessToken: typeof config.accessToken === "string" && config.accessToken.trim().length > 0,
      hasRefreshToken: typeof config.refreshToken === "string" && config.refreshToken.trim().length > 0,
    },
  };
}

integrationsRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const integrations = await storage.getIntegrationsByTenant(user.tenantId);
    res.json(integrations.map(serializeIntegration));
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get("/:provider", async (req, res, next) => {
  try {
    const user = req.user as User;
    const integration = await storage.getIntegrationByProvider(
      user.tenantId,
      req.params.provider,
    );

    if (!integration || integration.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Integration not found" });
    }

    res.json(serializeIntegration(integration));
  } catch (err) {
    next(err);
  }
});

integrationsRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const bodyData = insertIntegrationSchema.parse(req.body);

    const existing = await storage.getIntegrationByProvider(
      user.tenantId,
      bodyData.provider,
    );

    if (existing) {
      const updated = await storage.updateIntegration(existing.id, bodyData);
      return res.json(updated ? serializeIntegration(updated) : updated);
    }

    const integrationValues: InsertIntegration & { tenantId: number } = {
      ...bodyData,
      tenantId: user.tenantId,
    };
    const integration = await storage.createIntegration(integrationValues);

    res.status(201).json(serializeIntegration(integration));
  } catch (err) {
    next(err);
  }
});

integrationsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid integration id" });
    }

    const existing = await storage.getIntegration(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Integration not found" });
    }

    let revoked = false;

    if (existing.provider === "Meta") {
      const config = (existing.config ?? {}) as Record<string, unknown>;
      const storedToken =
        typeof config.accessToken === "string" ? config.accessToken : null;
      const accessToken = decryptMetaAccessToken(storedToken);

      if (accessToken) {
        const settings = await storage.getAppSettings();
        const metaAppSecret = resolveMetaAppSecret(settings);
        if (!metaAppSecret) {
          console.warn("Meta app secret missing; skipping token revocation", {
            integrationId: existing.id,
          });
        } else {
          const appSecretProof = generateAppSecretProof(
            accessToken,
            metaAppSecret,
          );

          const revokeResult = await revokeMetaAccessToken({
            accessToken,
            appSecretProof,
          });
          revoked = revokeResult.ok;

          if (!revokeResult.ok) {
            console.warn("Meta token revocation failed", {
              integrationId: existing.id,
              status: revokeResult.status,
            });
          }
        }
      } else {
        console.warn("Meta token unavailable for revocation", {
          integrationId: existing.id,
        });
      }
    }

    await storage.deleteIntegration(id);
    res.json({ message: "Integration deleted successfully", revoked });
  } catch (err) {
    next(err);
  }
});
