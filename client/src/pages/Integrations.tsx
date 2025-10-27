import { useState } from "react";
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

export default function Integrations() {
  const [metaStatus, setMetaStatus] = useState<"connected" | "pending" | "error">("connected");
  const [driveStatus, setDriveStatus] = useState<"connected" | "pending" | "error">("connected");
  const [isTesting, setIsTesting] = useState(false);
  const [isMetaDialogOpen, setIsMetaDialogOpen] = useState(false);
  const [isDriveDialogOpen, setIsDriveDialogOpen] = useState(false);

  const handleTestMeta = () => {
    setIsTesting(true);
    setTimeout(() => {
      setMetaStatus("connected");
      setIsTesting(false);
    }, 2000);
  };

  const handleTestDrive = () => {
    setIsTesting(true);
    setTimeout(() => {
      setDriveStatus("connected");
      setIsTesting(false);
    }, 2000);
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
                  <StatusBadge status={metaStatus} />
                </CardTitle>
                <CardDescription className="mt-2">
                  Conecte sua conta Meta Ads para gerenciar campanhas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Access Token:</span>
                <span className="ml-2 font-mono text-xs">EAAx•••••••••••••••</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Última verificação:</span>
                <span className="ml-2">27/10/2024 21:15</span>
              </div>
            </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestMeta}
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Google Drive API
                  <StatusBadge status={driveStatus} />
                </CardTitle>
                <CardDescription className="mt-2">
                  Acesse criativos e mídia armazenados no Drive
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Pasta Padrão:</span>
                <span className="ml-2 font-mono text-xs">1aBc•••••••••</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Última verificação:</span>
                <span className="ml-2">27/10/2024 21:15</span>
              </div>
            </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestDrive}
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
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhooks n8n</CardTitle>
          <CardDescription>
            Configure os webhooks para automação de processos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">URL do Webhook</Label>
            <Input
              id="webhook-url"
              placeholder="https://n8n.exemplo.com/webhook/..."
              defaultValue="https://n8n.exemplo.com/webhook/meta-ads"
              data-testid="input-webhook-url"
            />
          </div>
          <Button variant="outline" size="sm" data-testid="button-save-webhook">
            Salvar Webhook
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isMetaDialogOpen} onOpenChange={setIsMetaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Meta Ads API</DialogTitle>
            <DialogDescription>
              Atualize suas credenciais de acesso à API do Meta Ads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="meta-token">Access Token *</Label>
              <Input
                id="meta-token"
                type="password"
                placeholder="EAAx..."
                data-testid="input-meta-token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-app-id">App ID</Label>
              <Input
                id="meta-app-id"
                placeholder="123456789012345"
                data-testid="input-meta-app-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-app-secret">App Secret</Label>
              <Input
                id="meta-app-secret"
                type="password"
                placeholder="••••••••••••••••"
                data-testid="input-meta-app-secret"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsMetaDialogOpen(false)}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                console.log("Save Meta config");
                setIsMetaDialogOpen(false);
              }}
              data-testid="button-save"
            >
              Salvar
            </Button>
          </DialogFooter>
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
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="drive-folder">Pasta Padrão (ID) *</Label>
              <Input
                id="drive-folder"
                placeholder="1aBcDeFg..."
                data-testid="input-drive-folder"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drive-credentials">Service Account JSON</Label>
              <Input
                id="drive-credentials"
                type="file"
                accept=".json"
                data-testid="input-drive-credentials"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDriveDialogOpen(false)}
              data-testid="button-cancel-drive"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                console.log("Save Drive config");
                setIsDriveDialogOpen(false);
              }}
              data-testid="button-save-drive"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
