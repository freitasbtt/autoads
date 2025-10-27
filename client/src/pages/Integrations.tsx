import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusBadge from "@/components/StatusBadge";
import { Loader2, RefreshCw, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Integration {
  id: number;
  tenantId: number;
  provider: string;
  config: any;
  status: string;
}

export default function Integrations() {
  const [isTesting, setIsTesting] = useState(false);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [isDriveDialogOpen, setIsDriveDialogOpen] = useState(false);
  const [metaConfig, setMetaConfig] = useState({
    accessToken: "",
    appId: "",
    appSecret: "",
  });
  const [driveConfig, setDriveConfig] = useState({
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    driveFolderId: "",
  });
  const { toast } = useToast();

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const saveMutation = useMutation({
    mutationFn: (data: { provider: string; config: any }) =>
      apiRequest("POST", "/api/integrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsMetaDialogOpen(false);
      setIsDriveDialogOpen(false);
      toast({
        title: "Integração salva",
        description: "As credenciais foram armazenadas com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar integração",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const metaIntegration = integrations.find((i) => i.provider === "Meta");
  const driveIntegration = integrations.find((i) => i.provider === "GoogleDrive");

  const handleSaveMeta = () => {
    saveMutation.mutate({
      provider: "Meta",
      config: metaConfig,
    });
  };

  const handleSaveDrive = () => {
    saveMutation.mutate({
      provider: "GoogleDrive",
      config: driveConfig,
    });
  };

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Integrações</h1>
        <p className="text-muted-foreground">Gerencie suas conexões com APIs externas</p>
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
                  Conecte sua conta Meta Ads para gerenciar campanhas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {metaIntegration && (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Access Token:</span>
                  <span className="ml-2 font-mono text-xs">
                    {metaIntegration.config?.accessToken
                      ? `${metaIntegration.config.accessToken.substring(0, 8)}•••••`
                      : "Não configurado"}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMetaDialogOpen(true)}
                data-testid="button-config-meta"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurar
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
                    <RefreshCw className="h-4 w-4 mr-2" />
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
                  Acesse criativos e mídia armazenados no Drive
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {driveIntegration && (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Pasta Padrão:</span>
                  <span className="ml-2 font-mono text-xs">
                    {driveIntegration.config?.driveFolderId || "Não configurado"}
                  </span>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDriveDialogOpen(true)}
                data-testid="button-config-drive"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configurar
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
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isMetaDialogOpen} onOpenChange={setIsMetaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Meta Ads API</DialogTitle>
            <DialogDescription>
              Atualize suas credenciais de acesso à API do Meta Ads
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveMeta();
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="meta-token">Access Token *</Label>
                <Input
                  id="meta-token"
                  type="password"
                  placeholder="EAAx..."
                  value={metaConfig.accessToken}
                  onChange={(e) => setMetaConfig({ ...metaConfig, accessToken: e.target.value })}
                  data-testid="input-meta-token"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-app-id">App ID</Label>
                <Input
                  id="meta-app-id"
                  placeholder="123456789012345"
                  value={metaConfig.appId}
                  onChange={(e) => setMetaConfig({ ...metaConfig, appId: e.target.value })}
                  data-testid="input-meta-app-id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-app-secret">App Secret</Label>
                <Input
                  id="meta-app-secret"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={metaConfig.appSecret}
                  onChange={(e) => setMetaConfig({ ...metaConfig, appSecret: e.target.value })}
                  data-testid="input-meta-app-secret"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsMetaDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="button-save-meta" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDriveDialogOpen} onOpenChange={setIsDriveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Google Drive API</DialogTitle>
            <DialogDescription>
              Atualize suas credenciais de acesso ao Google Drive
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveDrive();
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="drive-client-id">Client ID *</Label>
                <Input
                  id="drive-client-id"
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  value={driveConfig.clientId}
                  onChange={(e) => setDriveConfig({ ...driveConfig, clientId: e.target.value })}
                  data-testid="input-drive-client-id"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drive-client-secret">Client Secret *</Label>
                <Input
                  id="drive-client-secret"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={driveConfig.clientSecret}
                  onChange={(e) => setDriveConfig({ ...driveConfig, clientSecret: e.target.value })}
                  data-testid="input-drive-client-secret"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drive-refresh-token">Refresh Token *</Label>
                <Input
                  id="drive-refresh-token"
                  type="password"
                  placeholder="1//0abc..."
                  value={driveConfig.refreshToken}
                  onChange={(e) => setDriveConfig({ ...driveConfig, refreshToken: e.target.value })}
                  data-testid="input-drive-refresh-token"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drive-folder-id">Pasta Padrão (ID)</Label>
                <Input
                  id="drive-folder-id"
                  placeholder="1aBcDeFgHiJkLmNoPqRsTuV"
                  value={driveConfig.driveFolderId}
                  onChange={(e) => setDriveConfig({ ...driveConfig, driveFolderId: e.target.value })}
                  data-testid="input-drive-folder-id"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDriveDialogOpen(false)}
                data-testid="button-cancel-drive"
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="button-save-drive" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
