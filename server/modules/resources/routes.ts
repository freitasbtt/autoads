import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { InsertResource, User } from "@shared/schema";
import { insertResourceSchema } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";

export const resourcesRouter = Router();

// Todas as rotas de recursos exigem utilizador autenticado
resourcesRouter.use(isAuthenticated);

const allowedTypes = [
  "account",
  "page",
  "instagram",
  "whatsapp",
  "leadform",
  "website",
  "drive_folder",
] as const;

type ResourceType = (typeof allowedTypes)[number];

// GET /api/resources
// Lista todos os recursos do tenant
resourcesRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;
      const resources = await storage.getResourcesByTenant(user.tenantId);
      res.json(resources);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/resources/:type
// Lista recursos de um tipo específico para o tenant
resourcesRouter.get(
  "/:type",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;
      const { type } = req.params;

      if (!allowedTypes.includes(type as ResourceType)) {
        return res.status(400).json({ message: "Invalid resource type" });
      }

      const resources = await storage.getResourcesByType(
        user.tenantId,
        type,
      );
      res.json(resources);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/resources/type/:type
// Apaga todos os recursos de um tipo (multi-tenant safe)
resourcesRouter.delete(
  "/type/:type",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;
      const { type } = req.params;

      if (!allowedTypes.includes(type as ResourceType)) {
        return res.status(400).json({ message: "Invalid resource type" });
      }

      const deleted = await storage.deleteResourcesByType(user.tenantId, type);
      return res.json({ deleted });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/resources
// Cria um recurso manualmente
resourcesRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);

// PATCH /api/resources/:id
// Atualiza parcialmente um recurso (multi-tenant safe)
resourcesRouter.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);

// DELETE /api/resources/:id
// Apaga um recurso (multi-tenant safe)
resourcesRouter.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);
