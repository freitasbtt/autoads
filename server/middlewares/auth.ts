import type { NextFunction, Request, Response } from "express";
import type { User } from "@shared/schema";
import { isAdminRole, isSystemAdminRole } from "../modules/auth/services/role.service";

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({ message: "Unauthorized" });
}

export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    if (isAdminRole(user.role)) {
      return next();
    }
  }

  res.status(403).json({ message: "Forbidden - Admin access required" });
}

export function isSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    if (isSystemAdminRole(user.role)) {
      return next();
    }
  }

  res.status(403).json({ message: "Forbidden - System admin access required" });
}
