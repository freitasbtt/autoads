import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Link as LinkIcon, Loader2, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { buildCsrfHeaders, captureCsrfTokenFromResponse, queryClient } from "@/lib/queryClient";

interface Integration {
  id: number;
  provider: string;
  config?: {
    accountName?: string | null;
    email?: string | null;
  };
  status: string;
  updatedAt?: string;
}

export default function Integrations() {
  const { toast } = useToast();
  const [isTestingMeta, setIsTestingMeta] = useState(false);
  const [isDisconnectingMeta, setIsDisconnectingMeta] = useState(false);

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const metaIntegration = integrations.find((integration) => integration.provider === "Meta");

  const handleMetaOAuth = useCallback(() => {
    window.location.href = "/auth/meta";
  }, []);

  const handleTestConnection = useCallback(async () => {
    setIsTestingMeta(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast({
        title: "Conexao testada",
        description: "A conexao com Meta esta funcionando.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao testar",
        description: err?.message ?? "Nao foi possivel testar a conexao com Meta.",
        variant: "destructive",
      });
    } finally {
      setIsTestingMeta(false);
    }
  }, [toast]);

  const handleDisconnect = useCallback(async () => {
    if (!metaIntegration) {
      return;
    }

    if (!window.confirm("Desconectar Meta? Voce pode conectar de novo depois.")) {
      return;
    }

    setIsDisconnectingMeta(true);
    try {
      const response = await fetch(`/api/integrations/${metaIntegration.id}`, {
        method: "DELETE",
        headers: buildCsrfHeaders(),
        credentials: "include",
      });
      captureCsrfTokenFromResponse(response);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || `Erro ${response.status} ao desconectar Meta`);
      }

      toast({
        title: "Integracao removida",
        description: "Meta foi desconectado.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    } catch (err: any) {
      toast({
        title: "Erro ao desconectar",
        description: err?.message ?? "Nao foi possivel desconectar Meta.",
        variant: "destructive",
      });
    } finally {
      setIsDisconnectingMeta(false);
    }
  }, [metaIntegration, toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      toast({
        title: "Conectado com sucesso",
        description: "Sua integracao com Meta foi configurada.",
      });
      window.history.replaceState({}, "", "/integrations");
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    }
  }, [toast]);

  const connected = Boolean(metaIntegration && metaIntegration.status === "connected");
  const lastTokenSaved =
    metaIntegration?.updatedAt && !Number.isNaN(Date.parse(metaIntegration.updatedAt))
      ? new Date(metaIntegration.updatedAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Integracoes</h1>
        <p className="text-sm text-muted-foreground">Conecte e gerencie o acesso da Meta Ads.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              Meta Ads API
              <StatusBadge status={connected ? "connected" : "pending"} />
            </CardTitle>
            <CardDescription>
              Conecte sua conta Meta para importar contas de anuncio, paginas, formularios e metricas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected && (
              <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Conectado com sucesso</span>
                </div>
                {lastTokenSaved && <div>Token salvo em {lastTokenSaved}</div>}
                {metaIntegration?.config?.accountName && (
                  <div>
                    <span className="font-medium text-foreground">Conta:</span>{" "}
                    {metaIntegration.config.accountName}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleMetaOAuth} className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                {connected ? "Reconectar OAuth" : "Conectar OAuth"}
              </Button>
              {connected && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isTestingMeta}
                    onClick={handleTestConnection}
                    className="flex items-center gap-2"
                  >
                    {isTestingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                    {isTestingMeta ? "Testando..." : "Testar Conexao"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDisconnectingMeta}
                    onClick={handleDisconnect}
                    className="flex items-center gap-2"
                  >
                    {isDisconnectingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                    {isDisconnectingMeta ? "Removendo..." : "Desconectar"}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-accent/20 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold leading-tight">Como funciona o OAuth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>Clique em Conectar OAuth e faca login com a conta Meta autorizada.</p>
          <p>O app salva o token com seguranca e usa esse acesso para consultar recursos da Meta.</p>
          <p className="pt-2 text-xs">
            Garanta que a URL de callback esteja configurada corretamente no App da Meta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
