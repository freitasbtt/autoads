import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Pause, Play, Trash2, Send, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Campaign {
  id: number;
  tenantId: number;
  name: string;
  objective: string;
  status: string;
  statusDetail: string | null;
  budget: string;
  accountId: number | null;
  pageId: number | null;
  instagramId: number | null;
  whatsappId: number | null;
  leadformId: number | null;
  websiteUrl: string | null;
  audienceIds: number[];
  title: string | null;
  message: string | null;
}

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/campaigns/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Status atualizado",
        description: "O status da campanha foi alterado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campanha excluída",
        description: "A campanha foi removida com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendWebhookMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/campaigns/${id}/send-webhook`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Webhook enviado",
        description: "Campanha enviada para n8n. Aguardando processamento...",
      });
    },
    onError: (error: any) => {
      // Extract message from error
      let errorMessage = "Não foi possível enviar os dados";
      
      if (error.message) {
        try {
          const match = error.message.match(/\d+:\s*(.+)/);
          if (match && match[1]) {
            const jsonPart = match[1];
            const parsed = JSON.parse(jsonPart);
            errorMessage = parsed.message || errorMessage;
          }
        } catch (e) {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Erro ao enviar webhook",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleToggleStatus = (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate({ id: campaign.id, status: newStatus });
  };

  const objectiveLabels: Record<string, string> = {
    LEAD: "Geração de Leads",
    TRAFFIC: "Tráfego",
    WHATSAPP: "WhatsApp",
    CONVERSIONS: "Conversões",
    REACH: "Alcance",
  };

  const statusLabels: Record<string, string> = {
    draft: "Rascunho",
    pending: "Processando",
    active: "Ativa",
    error: "Erro",
    paused: "Pausada",
    completed: "Concluída",
  };

  const getStatusBadge = (status: string, statusDetail: string | null) => {
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
    let icon = null;

    switch (status) {
      case "active":
        variant = "default";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "pending":
        variant = "secondary";
        icon = <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
        break;
      case "error":
        variant = "destructive";
        icon = <XCircle className="h-3 w-3 mr-1" />;
        break;
      case "draft":
        variant = "secondary";
        break;
      case "paused":
        variant = "outline";
        break;
      case "completed":
        variant = "outline";
        break;
    }

    return (
      <div className="flex flex-col gap-1">
        <Badge variant={variant} className="w-fit">
          {icon}
          {statusLabels[status] || status}
        </Badge>
        {statusDetail && (
          <span className="text-xs text-muted-foreground">{statusDetail}</span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Campanhas</h1>
          <p className="text-muted-foreground">Gerencie todas as suas campanhas Meta Ads</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setLocation("/campaigns/existing")}
            data-testid="button-add-to-existing"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar a Campanha Existente
          </Button>
          <Button onClick={() => setLocation("/campaigns/new")} data-testid="button-new-campaign">
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando campanhas...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma campanha cadastrada</p>
            <p className="text-sm text-muted-foreground mt-2">
              Clique em "Nova Campanha" para criar sua primeira campanha
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Todas as Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Nome
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Objetivo
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Orçamento
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b hover-elevate"
                      data-testid={`row-campaign-${campaign.id}`}
                    >
                      <td className="py-4 px-4 font-medium">{campaign.name}</td>
                      <td className="py-4 px-4">
                        <Badge variant="outline">
                          {objectiveLabels[campaign.objective] || campaign.objective}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(campaign.status, campaign.statusDetail)}
                      </td>
                      <td className="py-4 px-4 font-mono text-sm">{campaign.budget}</td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => sendWebhookMutation.mutate(campaign.id)}
                            data-testid={`button-send-webhook-${campaign.id}`}
                            title="Enviar para n8n"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              toast({
                                title: "Em desenvolvimento",
                                description: "Edição de campanha em breve",
                              });
                            }}
                            data-testid={`button-edit-campaign-${campaign.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleToggleStatus(campaign)}
                            data-testid={`button-toggle-campaign-${campaign.id}`}
                          >
                            {campaign.status === "active" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => deleteMutation.mutate(campaign.id)}
                            data-testid={`button-delete-campaign-${campaign.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
