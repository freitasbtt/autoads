import { Router } from "express";
import { z } from "zod";
import type { InsertUser, User } from "@shared/schema";
import { storage } from "../storage";
import { isAdmin, isSystemAdmin } from "../../middlewares/auth";
import { isSystemAdminRole } from "../auth/services/role.service";
import { hashPassword } from "../auth/services/password.service";

export const adminRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["system_admin", "tenant_admin", "member"]),
  tenantId: z.number().int().positive().optional(),
  tenantName: z.string().min(2).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["system_admin", "tenant_admin", "member"]).optional(),
  tenantId: z.number().int().positive().optional(),
  tenantName: z.string().min(2).optional(),
});

adminRouter.get("/settings", isSystemAdmin, async (_req, res, next) => {
  try {
    const settings = await storage.getAppSettings();
    if (!settings) {
      return res.json(null);
    }

    res.json({
      id: settings.id,
      metaAppId: settings.metaAppId,
      metaAppSecret: settings.metaAppSecret ? "***configured***" : null,
      googleClientId: settings.googleClientId,
      googleClientSecret: settings.googleClientSecret ? "***configured***" : null,
      n8nWebhookUrl: settings.n8nWebhookUrl,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/settings", isSystemAdmin, async (req, res, next) => {
  try {
    const settings = await storage.updateAppSettings(req.body);
    if (!settings) {
      return res.status(500).json({ message: "Failed to update settings" });
    }

    res.json({
      id: settings.id,
      metaAppId: settings.metaAppId,
      metaAppSecret: settings.metaAppSecret ? "***configured***" : null,
      googleClientId: settings.googleClientId,
      googleClientSecret: settings.googleClientSecret ? "***configured***" : null,
      n8nWebhookUrl: settings.n8nWebhookUrl,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/tenants", isSystemAdmin, async (_req, res, next) => {
  try {
    const tenants = await storage.getTenants();
    res.json(tenants);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users", isAdmin, async (req, res, next) => {
  try {
    const currentUser = req.user as User;
    const tenantIdParam = req.query.tenantId ? Number(req.query.tenantId) : undefined;

    if (tenantIdParam !== undefined && Number.isNaN(tenantIdParam)) {
      return res.status(400).json({ message: "Invalid tenantId" });
    }

    const tenants = await storage.getTenants();
    const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

    let users: User[];
    if (isSystemAdminRole(currentUser.role)) {
      if (tenantIdParam !== undefined) {
        if (!tenantMap.has(tenantIdParam)) {
          return res.status(404).json({ message: "Tenant not found" });
        }
        users = await storage.getUsersByTenant(tenantIdParam);
      } else {
        users = await storage.getAllUsers();
      }
    } else {
      users = await storage.getUsersByTenant(currentUser.tenantId);
    }

    const usersWithoutPasswords = users.map((user) => {
      const { password: _, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        tenantName: tenantMap.get(user.tenantId) ?? null,
      };
    });

    res.json(usersWithoutPasswords);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/users", isAdmin, async (req, res, next) => {
  try {
    const currentUser = req.user as User;
    const data = createUserSchema.parse(req.body);

    if (!isSystemAdminRole(currentUser.role) && data.role === "system_admin") {
      return res.status(403).json({ message: "Only system admins can create other system admins" });
    }

    const existingUser = await storage.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    let targetTenantId: number;
    let tenantName: string | null = null;

    if (isSystemAdminRole(currentUser.role)) {
      if (data.tenantId && data.tenantName) {
        return res.status(400).json({ message: "Provide either tenantId or tenantName, not both" });
      }

      if (data.tenantId) {
        const tenant = await storage.getTenant(data.tenantId);
        if (!tenant) {
          return res.status(404).json({ message: "Tenant not found" });
        }
        targetTenantId = tenant.id;
        tenantName = tenant.name;
      } else if (data.tenantName) {
        const tenant = await storage.createTenant({ name: data.tenantName });
        targetTenantId = tenant.id;
        tenantName = tenant.name;
      } else {
        return res.status(400).json({ message: "tenantId or tenantName must be provided" });
      }
    } else {
      targetTenantId = currentUser.tenantId;
      const tenant = await storage.getTenant(targetTenantId);
      tenantName = tenant?.name ?? null;
    }

    const hashedPassword = await hashPassword(data.password);
    const newUser = await storage.createUser({
      email: data.email,
      password: hashedPassword,
      tenantId: targetTenantId,
      role: data.role,
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({
      ...userWithoutPassword,
      tenantName,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/users/:id", isAdmin, async (req, res, next) => {
  try {
    const currentUser = req.user as User;
    const userId = Number.parseInt(req.params.id, 10);
    const data = updateUserSchema.parse(req.body);

    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isSystemAdminRole(currentUser.role) && existingUser.tenantId !== currentUser.tenantId) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isSystemAdminRole(currentUser.role) && data.role === "system_admin") {
      return res.status(403).json({ message: "Only system admins can grant system admin role" });
    }

    if (!isSystemAdminRole(currentUser.role) && (data.tenantId || data.tenantName)) {
      return res.status(403).json({ message: "Only system admins can reassign tenants" });
    }

    if (data.email && data.email !== existingUser.email) {
      const emailTaken = await storage.getUserByEmail(data.email);
      if (emailTaken) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    let updatedTenantId = existingUser.tenantId;
    let tenantName: string | null = null;

    if (isSystemAdminRole(currentUser.role)) {
      if (data.tenantId && data.tenantName) {
        return res.status(400).json({ message: "Provide either tenantId or tenantName, not both" });
      }

      if (data.tenantId) {
        const tenant = await storage.getTenant(data.tenantId);
        if (!tenant) {
          return res.status(404).json({ message: "Tenant not found" });
        }
        updatedTenantId = tenant.id;
        tenantName = tenant.name;
      } else if (data.tenantName) {
        const tenant = await storage.createTenant({ name: data.tenantName });
        updatedTenantId = tenant.id;
        tenantName = tenant.name;
      } else {
        const tenant = await storage.getTenant(updatedTenantId);
        tenantName = tenant?.name ?? null;
      }
    } else {
      const tenant = await storage.getTenant(updatedTenantId);
      tenantName = tenant?.name ?? null;
    }

    const updateData: Partial<InsertUser> = {};
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }
    if (updatedTenantId !== existingUser.tenantId) {
      updateData.tenantId = updatedTenantId;
    }

    const updatedUser = await storage.updateUser(userId, updateData);
    if (!updatedUser) {
      return res.status(500).json({ message: "Failed to update user" });
    }

    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json({
      ...userWithoutPassword,
      tenantName,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/users/:id", isAdmin, async (req, res, next) => {
  try {
    const currentUser = req.user as User;
    const userId = Number.parseInt(req.params.id, 10);

    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!isSystemAdminRole(currentUser.role) && existingUser.tenantId !== currentUser.tenantId) {
      return res.status(404).json({ message: "User not found" });
    }

    if (userId === currentUser.id) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    if (!isSystemAdminRole(currentUser.role) && isSystemAdminRole(existingUser.role)) {
      return res.status(403).json({ message: "Only system admins can remove other system admins" });
    }

    await storage.deleteUser(userId);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
});

