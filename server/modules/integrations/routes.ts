import { Router } from "express";
import type { User, InsertIntegration } from "@shared/schema";
import { insertIntegrationSchema } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";

export const integrationsRouter = Router();

integrationsRouter.use(isAuthenticated);

integrationsRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const integrations = await storage.getIntegrationsByTenant(user.tenantId);
    res.json(integrations);
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

    res.json(integration);
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
      return res.json(updated);
    }

    const integrationValues: InsertIntegration & { tenantId: number } = {
      ...bodyData,
      tenantId: user.tenantId,
    };
    const integration = await storage.createIntegration(integrationValues);

    res.status(201).json(integration);
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

    await storage.deleteIntegration(id);
    res.json({ message: "Integration deleted successfully" });
  } catch (err) {
    next(err);
  }
});
