"use client";

import { useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Dashboard from "./Dashboard";

type ShareStatus = {
  exists: boolean;
  requiresPassword: boolean;
  unlocked: boolean;
  expiresAt?: string;
};

export default function SharedDashboard() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadStatus = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/public/dashboard/share/status?token=${encodeURIComponent(token)}`,
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.message ?? "Link compartilhado invalido.");
        }
        if (!cancelled) setStatus(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nao foi possivel carregar o link.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return <SharedMessage message="Link compartilhado invalido." />;
  }

  if (isLoading) {
    return (
      <SharedMessage
        message="Carregando link compartilhado"
        loading
      />
    );
  }

  if (error) {
    return <SharedMessage message={error} />;
  }

  if (!status?.requiresPassword || status.unlocked) {
    return <Dashboard shareToken={token} readOnly />;
  }

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/public/dashboard/share/unlock?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message ?? "Senha invalida.");
      }
      setStatus((current) => current ? { ...current, unlocked: true } : current);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel desbloquear o link.");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-md border-slate-200 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <CardTitle>Dashboard protegido</CardTitle>
          <p className="text-sm text-muted-foreground">
            Informe a senha recebida para acessar este dashboard compartilhado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha do link"
            onKeyDown={(event) => {
              if (event.key === "Enter" && password.trim()) {
                void handleUnlock();
              }
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            className="w-full"
            disabled={isUnlocking || !password.trim()}
            onClick={() => void handleUnlock()}
          >
            {isUnlocking && <Loader2 className="h-4 w-4 animate-spin" />}
            Acessar dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SharedMessage({ message, loading = false }: { message: string; loading?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {message}
      </div>
    </div>
  );
}
