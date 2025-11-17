import type { User } from "@shared/schema";

/**
 * Roles that unlock access to tenant or system level administrative areas.
 * Exported so middlewares or feature modules can share a single definition.
 */
export const ADMIN_ROLES: ReadonlySet<User["role"]> = new Set([
  "system_admin",
  "tenant_admin",
]);

/**
 * Checks whether the provided role has admin privileges (system or tenant).
 */
export function isAdminRole(role: User["role"]): boolean {
  return ADMIN_ROLES.has(role);
}

/**
 * Checks whether the provided role is a system-level administrator.
 */
export function isSystemAdminRole(role: User["role"]): boolean {
  return role === "system_admin";
}
