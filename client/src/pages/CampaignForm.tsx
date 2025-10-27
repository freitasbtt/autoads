import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export default function CampaignForm() {
  const [objective, setObjective] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState<number[]>([]);

  const audiences = [
    {
      id: 1,
      name: "Público Principal - Leads 25-45",
      ageMin: 25,
      ageMax: 45,
      interests: ["Marketing Digital", "Empreendedorismo"],
      locations: ["São Paulo, Brasil", "Rio de Janeiro, Brasil"],
      size: "~500K",
      type: "Interesse",
    },
    {
      id: 2,
      name: "Clientes Existentes - Upload CSV",
      locations: ["Brasil"],
      size: "12.5K",
      type: "Custom List",
      uploadDate: "15/10/2024",
    },
    {
      id: 3,
      name: "Público Broad - 18-65",
      ageMin: 18,
      ageMax: 65,
      interests: ["Todos"],
      locations: ["Brasil", "Portugal"],
      size: "~2M",
      type: "Interesse",
    },
  ];

  const toggleAudience = (audienceId: number) => {
    setSelectedAudiences((prev) =>
      prev.includes(audienceId)
        ? prev.filter((id) => id !== audienceId)
        : [...prev, audienceId]
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Nova Campanha</h1>
        <p className="text-muted-foreground">Crie uma nova campanha Meta Ads com 3 Ad Sets</p>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="audiences" data-testid="tab-audiences">
            Públicos ({selectedAudiences.length})
          </TabsTrigger>
          <TabsTrigger value="creatives" data-testid="tab-creatives">
            Criativos
          </TabsTrigger>
          <TabsTrigger value="schedule" data-testid="tab-schedule">
            Agendamento
          </TabsTrigger>
        </TabsList>

        <form className="space-y-6">
          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Detalhes da Campanha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Nome da Campanha *</Label>
                  <Input
                    id="campaign-name"
                    placeholder="Ex: Promoção de Verão 2025"
                    data-testid="input-campaign-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="objective">Objetivo *</Label>
                    <Select value={objective} onValueChange={setObjective}>
                      <SelectTrigger id="objective" data-testid="select-objective">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LEAD">Geração de Leads</SelectItem>
                        <SelectItem value="TRAFFIC">Tráfego</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="CONVERSIONS">Conversões</SelectItem>
                        <SelectItem value="REACH">Alcance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget">Orçamento Diário *</Label>
                    <Input id="budget" type="number" placeholder="0.00" data-testid="input-budget" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recursos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="account">Conta Meta Ads *</Label>
                    <Select>
                      <SelectTrigger id="account" data-testid="select-account">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="act_123">Conta Principal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="page">Página Facebook *</Label>
                    <Select>
                      <SelectTrigger id="page" data-testid="select-page">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pg_987">Página Facebook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {objective === "LEAD" && (
                  <div className="space-y-2">
                    <Label htmlFor="leadform">Formulário de Leads *</Label>
                    <Select>
                      <SelectTrigger id="leadform" data-testid="select-leadform">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lf_321">Formulário Principal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {objective === "TRAFFIC" && (
                  <div className="space-y-2">
                    <Label htmlFor="website">Website URL *</Label>
                    <Input id="website" placeholder="https://exemplo.com" data-testid="input-website" />
                  </div>
                )}

                {objective === "WHATSAPP" && (
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp Number ID *</Label>
                    <Select>
                      <SelectTrigger id="whatsapp" data-testid="select-whatsapp">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wa_789">WhatsApp Business</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audiences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Selecione os Públicos-Alvo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Escolha um ou mais públicos para segmentar seus anúncios. Cada público será usado para
                  criar um Ad Set separado.
                </p>
                <div className="space-y-4">
                  {audiences.map((audience) => (
                    <div
                      key={audience.id}
                      className={`border rounded-md p-4 hover-elevate ${
                        selectedAudiences.includes(audience.id) ? "border-primary" : ""
                      }`}
                      data-testid={`audience-option-${audience.id}`}
                    >
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id={`audience-${audience.id}`}
                          checked={selectedAudiences.includes(audience.id)}
                          onCheckedChange={() => toggleAudience(audience.id)}
                          data-testid={`checkbox-audience-${audience.id}`}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`audience-${audience.id}`}
                            className="cursor-pointer font-medium"
                          >
                            {audience.name}
                          </Label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">{audience.type}</Badge>
                            <Badge variant="secondary">{audience.size}</Badge>
                          </div>
                          {audience.ageMin && audience.ageMax && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Idade: {audience.ageMin} - {audience.ageMax} anos
                            </p>
                          )}
                          {audience.interests && (
                            <div className="mt-2">
                              <p className="text-sm text-muted-foreground">
                                Interesses: {audience.interests.join(", ")}
                              </p>
                            </div>
                          )}
                          {audience.locations && (
                            <div className="mt-2">
                              <p className="text-sm text-muted-foreground">
                                Localizações: {audience.locations.join(", ")}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedAudiences.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Nenhum público selecionado. Selecione pelo menos um público para continuar.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="creatives" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Criativos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input id="title" placeholder="Título do anúncio" data-testid="input-title" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Texto Principal *</Label>
                  <Textarea
                    id="message"
                    placeholder="Mensagem do anúncio"
                    rows={4}
                    data-testid="input-message"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
                  <Select>
                    <SelectTrigger id="drive-folder" data-testid="select-drive-folder">
                      <SelectValue placeholder="Selecione a pasta com criativos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="folder_123">Pasta Principal de Criativos</SelectItem>
                      <SelectItem value="folder_456">Campanhas Sazonais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agendamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time">Data/Hora de Início *</Label>
                    <Input id="start-time" type="datetime-local" data-testid="input-start-time" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end-time">Data/Hora de Fim</Label>
                    <Input id="end-time" type="datetime-local" data-testid="input-end-time" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <div className="flex justify-end gap-4">
            <Button variant="outline" type="button" data-testid="button-cancel">
              Cancelar
            </Button>
            <Button type="submit" data-testid="button-submit">
              Criar Campanha
            </Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
