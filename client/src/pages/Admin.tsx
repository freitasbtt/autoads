import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Key, Webhook, Settings, Users } from "lucide-react";
import UserManagement from "@/pages/UserManagement";
import { useAuth } from "@/contexts/AuthContext";

interface AppSettings {
  id: number | null;
  gcsConfigured?: boolean;
  gcsBucketName: string | null;
  gcsClientEmail?: string | null;
  gcsProjectId?: string | null;
  gcsSourceLabel?: string | null;
  gcsFilePath?: string | null;
  gcsReason?: string | null;
  gcsMessage?: string | null;
  n8nWebhookUrl: string | null;
  updatedAt: Date | null;
}

export default function Admin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "system_admin";

  const { data: settings, isLoading: isLoadingSettings } = useQuery<AppSettings | null>({
    queryKey: ["/api/admin/settings"],
    enabled: isSystemAdmin,
  });

  const [formData, setFormData] = useState({
    n8nWebhookUrl: "",
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<typeof formData>) => apiRequest("PUT", "/api/admin/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso.",
      });
      setFormData({
        n8nWebhookUrl: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error?.message || "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!isSystemAdmin) {
      return;
    }

    const updates: Partial<typeof formData> = {};
    if (formData.n8nWebhookUrl) updates.n8nWebhookUrl = formData.n8nWebhookUrl;

    if (Object.keys(updates).length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: "Preencha pelo menos um campo para atualizar.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate(updates);
  };

  if (isSystemAdmin && isLoadingSettings) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Painel de Administração</h1>
        <p className="text-muted-foreground">
          Gerencie configurações globais e usuários da plataforma.
        </p>
      </div>

      {isSystemAdmin ? (
        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Usuários
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6 mt-6">
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-amber-600" />
                    <CardTitle>Google Cloud Storage</CardTitle>
                  </div>
                  <CardDescription>
                    O GCS agora e lido diretamente do ambiente ou de arquivo local no servidor, sem depender de configuracao manual na UI.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                    <div>
                      <span className="font-medium text-foreground">Configurado:</span>{" "}
                      {settings?.gcsConfigured ? "Sim" : "Nao"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Bucket:</span>{" "}
                      {settings?.gcsBucketName ?? "-"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Projeto:</span>{" "}
                      {settings?.gcsProjectId ?? "-"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Service account:</span>{" "}
                      {settings?.gcsClientEmail ?? "-"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Origem:</span>{" "}
                      {settings?.gcsSourceLabel ?? "-"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Arquivo:</span>{" "}
                      {settings?.gcsFilePath ?? "-"}
                    </div>
                  </div>
                  {settings?.gcsMessage && (
                    <p className="text-xs text-destructive">{settings.gcsMessage}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A configuracao do GCS deve ser feita no servidor usando `GCS_BUCKET_NAME` e um arquivo local ou variavel `GCS_SERVICE_ACCOUNT_*`.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Webhook className="h-5 w-5 text-purple-600" />
                    <CardTitle>n8n Webhook</CardTitle>
                  </div>
                  <CardDescription>Defina a URL do webhook utilizado nas automações.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="n8n-webhook-url">Webhook URL</Label>
                    <Input
                      id="n8n-webhook-url"
                      data-testid="input-n8n-webhook-url"
                      placeholder="https://seu-n8n.com/webhook/..."
                      value={formData.n8nWebhookUrl}
                      onChange={(e) => setFormData({ ...formData, n8nWebhookUrl: e.target.value })}
                    />
                    {settings?.n8nWebhookUrl && (
                      <p className="text-xs text-muted-foreground">Atual: {settings.n8nWebhookUrl}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFormData({
                    n8nWebhookUrl: "",
                  });
                }}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <UserManagement />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground">
                Apenas administradores do sistema podem alterar as configurações globais. Você ainda
                pode gerenciar os usuários do seu cliente.
              </p>
            </CardContent>
          </Card>
          <UserManagement />
        </div>
      )}
    </div>
  );
}
