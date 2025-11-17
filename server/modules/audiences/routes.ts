import { Router } from "express";
import type { User, InsertAudience } from "@shared/schema";
import { insertAudienceSchema, updateAudienceSchema } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";

export const audiencesRouter = Router();

audiencesRouter.use(isAuthenticated);

audiencesRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const audiences = await storage.getAudiencesByTenant(user.tenantId);
    res.json(audiences);
  } catch (err) {
    next(err);
  }
});

audiencesRouter.get("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid audience id" });
    }

    const audience = await storage.getAudience(id);
    if (!audience || audience.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Audience not found" });
    }

    res.json(audience);
  } catch (err) {
    next(err);
  }
});

audiencesRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const data = insertAudienceSchema.parse(req.body);
    const audienceValues: InsertAudience & { tenantId: number } = {
      ...data,
      tenantId: user.tenantId,
    };
    const audience = await storage.createAudience(audienceValues);
    res.status(201).json(audience);
  } catch (err) {
    next(err);
  }
});

audiencesRouter.patch("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid audience id" });
    }

    const existing = await storage.getAudience(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Audience not found" });
    }

    const data = updateAudienceSchema.parse(req.body);
    const audience = await storage.updateAudience(id, data);
    res.json(audience);
  } catch (err) {
    next(err);
  }
});

audiencesRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid audience id" });
    }

    const existing = await storage.getAudience(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Audience not found" });
    }

    await storage.deleteAudience(id);
    res.json({ message: "Audience deleted successfully" });
  } catch (err) {
    next(err);
  }
});
