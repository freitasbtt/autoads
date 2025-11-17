import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { isAuthenticated } from "../../middlewares/auth";
import type { InsertResource, User } from "@shared/schema";
import { insertResourceSchema } from "@shared/schema";
import { storage } from "../storage";

export const resourcesRouter = Router();

resourcesRouter.use(isAuthenticated);

resourcesRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const resources = await storage.getResourcesByTenant(user.tenantId);
    res.json(resources);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.get("/:type", async (req, res, next) => {
  try {
    const user = req.user as User;
    const resources = await storage.getResourcesByType(
      user.tenantId,
      req.params.type,
    );
    res.json(resources);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const data = insertResourceSchema.parse(req.body);
    const resourceValues: InsertResource & { tenantId: number } = {
      ...data,
      tenantId: user.tenantId,
    };
    const resource = await storage.createResource(resourceValues);
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.patch("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid resource id" });
    }

    const existing = await storage.getResource(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Resource not found" });
    }

    const data = insertResourceSchema.partial().parse(req.body);
    const resource = await storage.updateResource(id, data);
    res.json(resource);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid resource id" });
    }

    const existing = await storage.getResource(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Resource not found" });
    }

    await storage.deleteResource(id);
    res.json({ message: "Resource deleted successfully" });
  } catch (err) {
    next(err);
  }
});
