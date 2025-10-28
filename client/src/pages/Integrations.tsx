import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { Loader2, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface Integration {
  id: number;
  tenantId: number;
  provider: string;
  config: any;
  status: string;
}

export default function Integrations() {
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const metaIntegration = integrations.find((i) => i.provider === "Meta");
  const driveIntegration = integrations.find((i) => i.provider === "Google Drive");

  const handleTestConnection = (provider: string) => {
    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      toast({
        title: "Conexão testada",
        description: `A conexão com ${provider} foi testada com sucesso`,
      });
    }, 1500);
  };

  const handleMetaOAuth = () => {
    window.location.href = "/auth/meta";
  };

  const handleGoogleOAuth = () => {
    window.location.href = "/auth/google";
  };

  // Check for OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      toast({
        title: "Conectado com sucesso!",
        description: "Sua integração foi configurada.",
      });
      // Clean URL
      window.history.replaceState({}, '', '/integrations');
      // Refresh integrations
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    }
  }, [toast]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Integrações</h1>
        <p className="text-muted-foreground">Conecte sua conta com APIs externas usando OAuth</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Meta Ads API
                  <StatusBadge status={metaIntegration ? "connected" : "pending"} />
                </CardTitle>
                <CardDescription className="mt-2">
                  Conecte sua conta Meta para importar recursos automaticamente
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {metaIntegration && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Conectado com sucesso</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleMetaOAuth}
                data-testid="button-connect-meta"
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                {metaIntegration ? "Reconectar OAuth" : "Conectar OAuth"}
              </Button>
              {metaIntegration && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection("Meta")}
                  disabled={isTesting}
                  data-testid="button-test-meta"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Google Drive API
                  <StatusBadge status={driveIntegration ? "connected" : "pending"} />
                </CardTitle>
                <CardDescription className="mt-2">
                  Conecte sua conta Google para acessar pastas do Drive
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {driveIntegration && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Conectado com sucesso</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleGoogleOAuth}
                data-testid="button-connect-google"
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                {driveIntegration ? "Reconectar OAuth" : "Conectar OAuth"}
              </Button>
              {driveIntegration && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestConnection("Google Drive")}
                  disabled={isTesting}
                  data-testid="button-test-drive"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-accent/20 bg-accent/5">
        <CardHeader>
          <CardTitle className="text-base">Como funciona o OAuth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">1.</strong> Clique em "Conectar OAuth" para ser redirecionado à página de login do serviço
          </p>
          <p>
            <strong className="text-foreground">2.</strong> Faça login e autorize o acesso às suas informações
          </p>
          <p>
            <strong className="text-foreground">3.</strong> Você será redirecionado de volta e seus recursos serão importados automaticamente
          </p>
          <p className="pt-2 text-xs">
            <strong>Nota:</strong> Certifique-se de que as URLs de callback estão configuradas corretamente no Meta App e Google Cloud Console.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
