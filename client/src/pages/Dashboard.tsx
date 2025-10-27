import { DollarSign, Users, MousePointerClick, TrendingUp } from "lucide-react";
import KPICard from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const campaigns = [
    { id: 1, name: "Summer Sale 2025", objective: "CONVERSIONS", status: "active", spend: "R$ 4.250", leads: 142, cpl: "R$ 29,93" },
    { id: 2, name: "Brand Awareness Q1", objective: "REACH", status: "active", spend: "R$ 3.100", leads: 89, cpl: "R$ 34,83" },
    { id: 3, name: "Lead Generation", objective: "LEAD", status: "paused", spend: "R$ 2.890", leads: 76, cpl: "R$ 38,03" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral das suas campanhas Meta Ads</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Gasto"
          value="R$ 12.450"
          icon={DollarSign}
          trend={{ value: "12.5%", positive: true }}
        />
        <KPICard
          title="Total Leads"
          value="307"
          icon={Users}
          trend={{ value: "8.2%", positive: true }}
        />
        <KPICard
          title="CPL Médio"
          value="R$ 40,55"
          icon={TrendingUp}
          trend={{ value: "3.1%", positive: false }}
        />
        <KPICard
          title="CTR Médio"
          value="2.4%"
          icon={MousePointerClick}
          trend={{ value: "0.4%", positive: true }}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl">Campanhas Ativas</CardTitle>
          <Button data-testid="button-new-campaign">Nova Campanha</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Objetivo</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Gasto</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Leads</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">CPL</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b hover-elevate" data-testid={`row-campaign-${campaign.id}`}>
                    <td className="py-4 px-4 font-medium">{campaign.name}</td>
                    <td className="py-4 px-4">
                      <Badge variant="outline">{campaign.objective}</Badge>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                        {campaign.status === "active" ? "Ativa" : "Pausada"}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right font-mono">{campaign.spend}</td>
                    <td className="py-4 px-4 text-right">{campaign.leads}</td>
                    <td className="py-4 px-4 text-right font-mono">{campaign.cpl}</td>
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
