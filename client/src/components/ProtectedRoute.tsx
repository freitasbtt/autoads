import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import type { User } from "@shared/schema";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: User["role"] | User["role"][];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const allowedRoles = useMemo<User["role"][] | undefined>(() => {
    if (requiredRoles === undefined) return undefined;
    return Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  }, [requiredRoles]);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/");
        return;
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        setLocation("/");
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
