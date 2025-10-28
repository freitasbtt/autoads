import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Key, Webhook, Settings, Users } from "lucide-react";
import UserManagement from "@/pages/UserManagement";

interface AppSettings {
  id: number;
  metaAppId: string | null;
  metaAppSecret: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  n8nWebhookUrl: string | null;
  updatedAt: Date;
}

export default function Admin() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<AppSettings | null>({
    queryKey: ["/api/admin/settings"],
  });

  const [formData, setFormData] = useState({
    metaAppId: "",
    metaAppSecret: "",
    googleClientId: "",
    googleClientSecret: "",
    n8nWebhookUrl: "",
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<typeof formData>) =>
      apiRequest("PUT", "/api/admin/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso.",
      });
      setFormData({
        metaAppId: "",
        metaAppSecret: "",
        googleClientId: "",
        googleClientSecret: "",
        n8nWebhookUrl: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const updates: any = {};
    
    if (formData.metaAppId) updates.metaAppId = formData.metaAppId;
    if (formData.metaAppSecret) updates.metaAppSecret = formData.metaAppSecret;
    if (formData.googleClientId) updates.googleClientId = formData.googleClientId;
    if (formData.googleClientSecret) updates.googleClientSecret = formData.googleClientSecret;
    if (formData.n8nWebhookUrl) updates.n8nWebhookUrl = formData.n8nWebhookUrl;

    if (Object.keys(updates).length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: "Preencha ao menos um campo para atualizar.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate(updates);
  };

  if (isLoading) {
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
          Gerencie configurações do sistema e usuários (acesso restrito a administradores)
        </p>
      </div>

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
            {/* Meta OAuth */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <CardTitle>Meta OAuth App</CardTitle>
                </div>
                <CardDescription>
                  Configurações para autenticação OAuth com Meta (Facebook/Instagram)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="meta-app-id">App ID</Label>
                  <Input
                    id="meta-app-id"
                    data-testid="input-meta-app-id"
                    placeholder="Digite o Meta App ID"
                    value={formData.metaAppId}
                    onChange={(e) => setFormData({ ...formData, metaAppId: e.target.value })}
                  />
                  {settings?.metaAppId && (
                    <p className="text-xs text-muted-foreground">
                      Atual: {settings.metaAppId}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta-app-secret">App Secret</Label>
                  <Input
                    id="meta-app-secret"
                    data-testid="input-meta-app-secret"
                    type="password"
                    placeholder="Digite o Meta App Secret"
                    value={formData.metaAppSecret}
                    onChange={(e) => setFormData({ ...formData, metaAppSecret: e.target.value })}
                  />
                  {settings?.metaAppSecret && (
                    <p className="text-xs text-muted-foreground">
                      {settings.metaAppSecret}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Google OAuth */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-green-600" />
                  <CardTitle>Google OAuth App</CardTitle>
                </div>
                <CardDescription>
                  Configurações para autenticação OAuth com Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="google-client-id">Client ID</Label>
                  <Input
                    id="google-client-id"
                    data-testid="input-google-client-id"
                    placeholder="Digite o Google Client ID"
                    value={formData.googleClientId}
                    onChange={(e) => setFormData({ ...formData, googleClientId: e.target.value })}
                  />
                  {settings?.googleClientId && (
                    <p className="text-xs text-muted-foreground">
                      Atual: {settings.googleClientId}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-client-secret">Client Secret</Label>
                  <Input
                    id="google-client-secret"
                    data-testid="input-google-client-secret"
                    type="password"
                    placeholder="Digite o Google Client Secret"
                    value={formData.googleClientSecret}
                    onChange={(e) => setFormData({ ...formData, googleClientSecret: e.target.value })}
                  />
                  {settings?.googleClientSecret && (
                    <p className="text-xs text-muted-foreground">
                      {settings.googleClientSecret}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* n8n Webhook */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Webhook className="h-5 w-5 text-purple-600" />
                  <CardTitle>n8n Webhook</CardTitle>
                </div>
                <CardDescription>
                  URL do webhook n8n para automação de campanhas
                </CardDescription>
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
                    <p className="text-xs text-muted-foreground">
                      Atual: {settings.n8nWebhookUrl}
                    </p>
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
                  metaAppId: "",
                  metaAppSecret: "",
                  googleClientId: "",
                  googleClientSecret: "",
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
              {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
