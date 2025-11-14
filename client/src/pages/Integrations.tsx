import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Link as LinkIcon,
  CheckCircle2,
  PlugZap,

} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface Integration {
  id: number;
  tenantId: number;
  provider: string; // "Meta" | "Google Drive" etc.
  config: any;
  status: string; // "connected" | "pending" etc.
  createdAt?: string;
  updatedAt?: string;
  lastChecked?: string | null;
}

export default function Integrations() {
  const { toast } = useToast();

  // estados de loading separados pra UX melhor
  const [isTestingMeta, setIsTestingMeta] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);

  const [isDisconnectingMeta, setIsDisconnectingMeta] = useState(false);
  const [isDisconnectingDrive, setIsDisconnectingDrive] = useState(false);

  // pega integrações do backend
  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const metaIntegration = integrations.find(
    (i) => i.provider === "Meta",
  );
  const driveIntegration = integrations.find(
    (i) => i.provider === "Google Drive",
  );

  /* ------------------------------------------
   * handlers de ação
   * ------------------------------------------ */

  const handleTestConnection = useCallback(
    async (provider: "Meta" | "Google Drive") => {
      if (provider === "Meta") {
        setIsTestingMeta(true);
      } else {
        setIsTestingDrive(true);
      }

      try {
        // aqui você pode futuramente chamar um /api/integrations/:id/test
        // por enquanto só simula sucesso
        await new Promise((resolve) => setTimeout(resolve, 1500));

        toast({
          title: "Conexão testada",
          description: `A conexão com ${provider} está funcionando.`,
        });
      } catch (err: any) {
        toast({
          title: "Erro ao testar",
          description:
            err?.message ??
            `Não foi possível testar a conexão com ${provider}.`,
          variant: "destructive",
        });
      } finally {
        if (provider === "Meta") {
          setIsTestingMeta(false);
        } else {
          setIsTestingDrive(false);
        }
      }
    },
    [toast],
  );

  const handleMetaOAuth = useCallback(() => {
    window.location.href = "/auth/meta";
  }, []);

  const handleGoogleOAuth = useCallback(() => {
    window.location.href = "/auth/google";
  }, []);

  /**
   * handleDisconnect
   * - chama DELETE /api/integrations/:id
   * - invalida o cache do react-query
   * - mostra toast
   * - tem confirm() simples
   */
  const handleDisconnect = useCallback(
    async (integration: Integration) => {
      const isMeta = integration.provider === "Meta";
      const isDrive = integration.provider === "Google Drive";

      if (
        !window.confirm(
          `Desconectar ${integration.provider}? Você pode conectar de novo depois.`,
        )
      ) {
        return;
      }

      if (isMeta) setIsDisconnectingMeta(true);
      if (isDrive) setIsDisconnectingDrive(true);

      try {
        const res = await fetch(
          `/api/integrations/${integration.id}`,
          {
            method: "DELETE",
          },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.message ||
              `Erro ${res.status} ao desconectar ${integration.provider}`,
          );
        }

        toast({
          title: "Integração removida",
          description: `${integration.provider} foi desconectado.`,
        });

        // força recarregar lista de integrações
        queryClient.invalidateQueries({
          queryKey: ["/api/integrations"],
        });
      } catch (err: any) {
        toast({
          title: "Erro ao desconectar",
          description:
            err?.message ??
            `Não foi possível desconectar ${integration.provider}.`,
          variant: "destructive",
        });
      } finally {
        if (isMeta) setIsDisconnectingMeta(false);
        if (isDrive) setIsDisconnectingDrive(false);
      }
    },
    [toast],
  );

  /* ------------------------------------------
   * efeito pós-oauth (?oauth=success)
   * ------------------------------------------ */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      toast({
        title: "Conectado com sucesso!",
        description: "Sua integração foi configurada.",
      });

      // tira o query param da URL
      window.history.replaceState({}, "", "/integrations");

      // atualiza as integrações
      queryClient.invalidateQueries({
        queryKey: ["/api/integrations"],
      });
    }
  }, [toast]);

  /* ------------------------------------------
   * JSX helpers
   * ------------------------------------------ */

  function ProviderCard({
    title,
    description,
    integration,
    onConnect,
    onTest,
    onDisconnect,
    isTesting,
    isDisconnecting,
  }: {
    title: string;
    description: string;
    integration: Integration | undefined;
    onConnect: () => void;
    onTest: () => void;
    onDisconnect: () => void;
    isTesting: boolean;
    isDisconnecting: boolean;
  }) {
    const connected = Boolean(integration && integration.status === "connected");
    const lastTokenSaved =
      integration?.updatedAt && !Number.isNaN(Date.parse(integration.updatedAt))
        ? new Date(integration.updatedAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;

    return (
      <Card className="relative overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                {title}
                <StatusBadge
                  status={connected ? "connected" : "pending"}
                />
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {description}
              </CardDescription>

              {connected && (
                <div className="space-y-1 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Conectado com sucesso</span>
                  </div>
                  {lastTokenSaved && (
                    <div>
                      Token salvo em{" "}
                      <span className="font-semibold text-foreground">
                        {lastTokenSaved}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {/* Conectar / Reconectar */}
            <Button
              variant="default"
              size="sm"
              onClick={onConnect}
              className="flex items-center gap-2"
              data-testid={`button-connect-${title
                .toLowerCase()
                .replace(/\s+/g, "")}`}
            >
              <LinkIcon className="h-4 w-4" />
              <span>
                {connected ? "Reconectar OAuth" : "Conectar OAuth"}
              </span>
            </Button>

            {/* Testar conexão */}
            {connected && (
              <Button
                variant="outline"
                size="sm"
                disabled={isTesting}
                onClick={onTest}
                className="flex items-center gap-2"
                data-testid={`button-test-${title
                  .toLowerCase()
                  .replace(/\s+/g, "")}`}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                <span>
                  {isTesting
                    ? "Testando..."
                    : "Testar Conexão"}
                </span>
              </Button>
            )}

            {/* Desconectar */}
            {connected && (
              <Button
                variant="destructive"
                size="sm"
                disabled={isDisconnecting}
                onClick={onDisconnect}
                className="flex items-center gap-2"
                data-testid={`button-disconnect-${title
                  .toLowerCase()
                  .replace(/\s+/g, "")}`}
              >
                {isDisconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                <span>
                  {isDisconnecting
                    ? "Removendo..."
                    : "Desconectar"}
                </span>
              </Button>
            )}
          </div>

          {/* Metadado opcional da integração (ex: nome da conta) */}
          {connected && integration?.config && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {/* exemplo: mostra algo útil que veio do OAuth */}
              {integration.config.accountName && (
                <div>
                  <span className="text-foreground font-medium">
                    Conta:
                  </span>{" "}
                  {integration.config.accountName}
                </div>
              )}
              {integration.config.email && (
                <div>
                  <span className="text-foreground font-medium">
                    E-mail:
                  </span>{" "}
                  {integration.config.email}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------------------------------
   * render final
   * ------------------------------------------ */

  return (
    <div className="p-6 space-y-6">
      {/* título da página */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Integrações
        </h1>
        <p className="text-muted-foreground text-sm">
          Conecte e gerencie acessos a provedores externos
          (Meta Ads, Google Drive etc.)
        </p>
      </div>

      {/* cards de integrações */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* META */}
        <ProviderCard
          title="Meta Ads API"
          description="Conecte sua conta Meta para importar contas de anúncio e métricas de campanha automaticamente."
          integration={metaIntegration}
          onConnect={handleMetaOAuth}
          onTest={() => handleTestConnection("Meta")}
          onDisconnect={() =>
            metaIntegration && handleDisconnect(metaIntegration)
          }
          isTesting={isTestingMeta}
          isDisconnecting={isDisconnectingMeta}
        />

        {/* DRIVE */}
        <ProviderCard
          title="Google Drive API"
          description="Conecte seu Google Drive para acessar pastas e arquivos usados nos criativos."
          integration={driveIntegration}
          onConnect={handleGoogleOAuth}
          onTest={() => handleTestConnection("Google Drive")}
          onDisconnect={() =>
            driveIntegration && handleDisconnect(driveIntegration)
          }
          isTesting={isTestingDrive}
          isDisconnecting={isDisconnectingDrive}
        />
      </div>

      {/* bloco educativo */}
      <Card className="border-accent/20 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold leading-tight">
            Como funciona o OAuth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">1.</strong>{" "}
            Clique em <span className="font-medium text-foreground">Conectar OAuth</span> e faça login no provedor.
          </p>
          <p>
            <strong className="text-foreground">2.</strong>{" "}
            Você autoriza o acesso somente ao que precisamos (contas de anúncio, campanhas, pastas do Drive etc.).
          </p>
          <p>
            <strong className="text-foreground">3.</strong>{" "}
            Voltando para cá, sua conta aparece como{" "}
            <StatusBadge status="connected" /> e nós já conseguimos
            puxar recursos automaticamente.
          </p>
          <p className="pt-2 text-xs text-muted-foreground">
            <strong>Nota:</strong> garanta que as URLs de callback
            estão configuradas corretamente no App do Meta e no
            Google Cloud Console — isso é obrigatório para concluir o login.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
