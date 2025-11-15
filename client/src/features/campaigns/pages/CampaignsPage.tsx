import { useState, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignDetailsModal } from "@/components/CampaignDetailsModal";
import { Edit, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { CampaignStatusBadge } from "../components/CampaignStatusBadge";
import { objectiveLabels } from "../constants";
import { useCampaignListData } from "../hooks/useCampaignListData";
import { useCampaignMutations } from "../hooks/useCampaignMutations";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@shared/schema";

export function CampaignsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showSendButton, setShowSendButton] = useState(false);
  const { campaigns, isLoading, resources, audiences } = useCampaignListData();
  const { toggleStatus, deleteCampaign } = useCampaignMutations();

  const handleToggleStatus = (campaign: Campaign, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const newStatus = campaign.status === "active" ? "paused" : "active";
    toggleStatus({ id: campaign.id, status: newStatus });
  };

  const handleOpenSendModal = (campaign: Campaign, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSelectedCampaign(campaign);
    setShowSendButton(true);
    setModalOpen(true);
  };

  const handleRowClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setShowSendButton(false);
    setModalOpen(true);
  };

  const handleDelete = (campaignId: number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    deleteCampaign(campaignId);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Campanhas</h1>
          <p className="text-muted-foreground">
            Gerencie todas as suas campanhas Meta Ads
          </p>
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
              Clique em &quot;Nova Campanha&quot; para criar sua primeira campanha
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
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b hover-elevate cursor-pointer"
                      data-testid={`row-campaign-${campaign.id}`}
                      onClick={() => handleRowClick(campaign)}
                    >
                      <td className="py-4 px-4 font-medium">{campaign.name}</td>
                      <td className="py-4 px-4">
                        <Badge variant="outline">
                          {objectiveLabels[campaign.objective] || campaign.objective}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <CampaignStatusBadge
                          status={campaign.status}
                          statusDetail={campaign.statusDetail}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => handleOpenSendModal(campaign, e)}
                            data-testid={`button-send-webhook-${campaign.id}`}
                            title="Enviar para n8n"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
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
                            onClick={(e) => handleToggleStatus(campaign, e)}
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
                            onClick={(e) => handleDelete(campaign.id, e)}
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

      <CampaignDetailsModal
        campaign={selectedCampaign}
        open={modalOpen}
        onOpenChange={setModalOpen}
        resources={resources}
        audiences={audiences}
        showSendButton={showSendButton}
      />
    </div>
  );
}
