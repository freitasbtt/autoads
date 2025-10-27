import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Pause, Play, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Campaigns() {
  const [, setLocation] = useLocation();

  //todo: remove mock functionality
  const campaigns = [
    {
      id: 1,
      name: "Summer Sale 2025",
      objective: "CONVERSIONS",
      status: "active",
      spend: "R$ 4.250",
      leads: 142,
      cpl: "R$ 29,93",
      startDate: "01/10/2024",
      endDate: "31/12/2024",
    },
    {
      id: 2,
      name: "Brand Awareness Q1",
      objective: "REACH",
      status: "active",
      spend: "R$ 3.100",
      leads: 89,
      cpl: "R$ 34,83",
      startDate: "15/10/2024",
      endDate: null,
    },
    {
      id: 3,
      name: "Lead Generation",
      objective: "LEAD",
      status: "paused",
      spend: "R$ 2.890",
      leads: 76,
      cpl: "R$ 38,03",
      startDate: "05/10/2024",
      endDate: "30/11/2024",
    },
    {
      id: 4,
      name: "WhatsApp Campaign",
      objective: "WHATSAPP",
      status: "active",
      spend: "R$ 1.780",
      leads: 52,
      cpl: "R$ 34,23",
      startDate: "20/10/2024",
      endDate: null,
    },
    {
      id: 5,
      name: "Traffic to Website",
      objective: "TRAFFIC",
      status: "paused",
      spend: "R$ 430",
      leads: 15,
      cpl: "R$ 28,67",
      startDate: "10/10/2024",
      endDate: "25/10/2024",
    },
  ];

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

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Todas as Campanhas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Objetivo</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Período</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Gasto</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Leads</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">CPL</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Ações</th>
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
                      <Badge variant="outline">{campaign.objective}</Badge>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                        {campaign.status === "active" ? "Ativa" : "Pausada"}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-sm">
                      {campaign.startDate}
                      {campaign.endDate && ` - ${campaign.endDate}`}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm">{campaign.spend}</td>
                    <td className="py-4 px-4 text-right">{campaign.leads}</td>
                    <td className="py-4 px-4 text-right font-mono text-sm">{campaign.cpl}</td>
                    <td className="py-4 px-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          data-testid="button-edit-campaign"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          data-testid="button-toggle-campaign"
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
                          data-testid="button-delete-campaign"
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
    </div>
  );
}
