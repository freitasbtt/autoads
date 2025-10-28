import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Resource {
  id: number;
  tenantId: number;
  type: string;
  name: string;
  value: string;
}

interface Audience {
  id: number;
  tenantId: number;
  name: string;
  type: string;
  ageMin: number | null;
  ageMax: number | null;
  interests: string[] | null;
  behaviors: string[] | null;
  locations: string[] | null;
}

export default function CampaignForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [objective, setObjective] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    budget: "",
    accountId: "",
    pageId: "",
    instagramId: "",
    whatsappId: "",
    leadformId: "",
    websiteUrl: "",
    title: "",
    message: "",
    driveFolderId: "",
  });

  // Fetch resources and audiences from API
  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const { data: audiences = [] } = useQuery<Audience[]>({
    queryKey: ["/api/audiences"],
  });

  // Group resources by type
  const accounts = resources.filter((r) => r.type === "account");
  const pages = resources.filter((r) => r.type === "page");
  const instagrams = resources.filter((r) => r.type === "instagram");
  const whatsapps = resources.filter((r) => r.type === "whatsapp");
  const leadforms = resources.filter((r) => r.type === "leadform");

  const toggleAudience = (audienceId: number) => {
    setSelectedAudiences((prev) =>
      prev.includes(audienceId)
        ? prev.filter((id) => id !== audienceId)
        : [...prev, audienceId]
    );
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campanha criada!",
        description: "A campanha foi criada com sucesso",
      });
      setLocation("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedAudiences.length === 0) {
      toast({
        title: "Erro de validação",
        description: "Selecione pelo menos um público",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      name: formData.name,
      objective,
      status: "draft",
      budget: formData.budget,
      accountId: formData.accountId ? Number(formData.accountId) : null,
      pageId: formData.pageId ? Number(formData.pageId) : null,
      instagramId: formData.instagramId ? Number(formData.instagramId) : null,
      whatsappId: formData.whatsappId ? Number(formData.whatsappId) : null,
      leadformId: formData.leadformId ? Number(formData.leadformId) : null,
      websiteUrl: formData.websiteUrl || null,
      audienceIds: selectedAudiences,
      title: formData.title,
      message: formData.message,
      driveFolderId: formData.driveFolderId || null,
    });
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

        <form onSubmit={handleSubmit} className="space-y-6">
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
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    <Input 
                      id="budget" 
                      type="number" 
                      placeholder="0.00"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      data-testid="input-budget" 
                    />
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
                    <Select value={formData.accountId} onValueChange={(v) => setFormData({ ...formData, accountId: v })}>
                      <SelectTrigger id="account" data-testid="select-account">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={String(account.id)}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="page">Página Facebook *</Label>
                    <Select value={formData.pageId} onValueChange={(v) => setFormData({ ...formData, pageId: v })}>
                      <SelectTrigger id="page" data-testid="select-page">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {pages.map((page) => (
                          <SelectItem key={page.id} value={String(page.id)}>
                            {page.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {objective === "LEAD" && (
                  <div className="space-y-2">
                    <Label htmlFor="leadform">Formulário de Leads *</Label>
                    <Select value={formData.leadformId} onValueChange={(v) => setFormData({ ...formData, leadformId: v })}>
                      <SelectTrigger id="leadform" data-testid="select-leadform">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {leadforms.map((leadform) => (
                          <SelectItem key={leadform.id} value={String(leadform.id)}>
                            {leadform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {objective === "TRAFFIC" && (
                  <div className="space-y-2">
                    <Label htmlFor="website">Website URL *</Label>
                    <Input 
                      id="website" 
                      placeholder="https://exemplo.com"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      data-testid="input-website" 
                    />
                  </div>
                )}

                {objective === "WHATSAPP" && (
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp Number ID *</Label>
                    <Select value={formData.whatsappId} onValueChange={(v) => setFormData({ ...formData, whatsappId: v })}>
                      <SelectTrigger id="whatsapp" data-testid="select-whatsapp">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {whatsapps.map((whatsapp) => (
                          <SelectItem key={whatsapp.id} value={String(whatsapp.id)}>
                            {whatsapp.name}
                          </SelectItem>
                        ))}
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
                  <Input 
                    id="title" 
                    placeholder="Título do anúncio"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    data-testid="input-title" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Texto Principal *</Label>
                  <Textarea
                    id="message"
                    placeholder="Mensagem do anúncio"
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    data-testid="input-message"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
                  <Input 
                    id="drive-folder"
                    placeholder="Insira o ID da pasta do Drive"
                    value={formData.driveFolderId}
                    onChange={(e) => setFormData({ ...formData, driveFolderId: e.target.value })}
                    data-testid="input-drive-folder"
                  />
                  <p className="text-xs text-muted-foreground">Você pode obter o ID da pasta após conectar OAuth com Google Drive</p>
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
