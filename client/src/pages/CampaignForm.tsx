import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronRight, ChevronLeft, Plus, Trash2, Check } from "lucide-react";
import { Resource, Audience } from "@shared/schema";

interface AdSet {
  audienceId: string;
  budget: string;
  startDate: string;
  endDate: string;
}

interface Creative {
  title: string;
  text: string;
  driveFolderId: string;
}

export default function CampaignForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Campaign Configuration
  const [config, setConfig] = useState({
    accountId: "",
    name: "",
    objective: "",
    pageId: "",
    instagramId: "",
    whatsappId: "",
    leadformId: "",
  });

  // Step 2: Ad Sets (can add multiple)
  const [adSets, setAdSets] = useState<AdSet[]>([
    { audienceId: "", budget: "", startDate: "", endDate: "" },
  ]);

  // Step 3: Creatives (can add multiple)
  const [creatives, setCreatives] = useState<Creative[]>([
    { title: "", text: "", driveFolderId: "" },
  ]);

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
  const driveFolders = resources.filter((r) => r.type === "drive_folder");

  // Add/Remove Ad Set
  const addAdSet = () => {
    setAdSets([...adSets, { audienceId: "", budget: "", startDate: "", endDate: "" }]);
  };

  const removeAdSet = (index: number) => {
    if (adSets.length > 1) {
      setAdSets(adSets.filter((_, i) => i !== index));
    }
  };

  const updateAdSet = (index: number, field: keyof AdSet, value: string) => {
    const updated = [...adSets];
    updated[index][field] = value;
    setAdSets(updated);
  };

  // Add/Remove Creative
  const addCreative = () => {
    setCreatives([...creatives, { title: "", text: "", driveFolderId: "" }]);
  };

  const removeCreative = (index: number) => {
    if (creatives.length > 1) {
      setCreatives(creatives.filter((_, i) => i !== index));
    }
  };

  const updateCreative = (index: number, field: keyof Creative, value: string) => {
    const updated = [...creatives];
    updated[index][field] = value;
    setCreatives(updated);
  };

  // Validation for each step
  const isStep1Valid = () => {
    return config.accountId && config.name && config.objective;
  };

  const isStep2Valid = () => {
    return adSets.every((adSet) => adSet.audienceId && adSet.budget);
  };

  const isStep3Valid = () => {
    return creatives.every((creative) => creative.title && creative.text);
  };

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Rascunho criado!",
        description: "A campanha foi salva como rascunho com sucesso.",
      });
      setLocation("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar rascunho",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!isStep3Valid()) {
      toast({
        title: "Erro de validação",
        description: "Preencha todos os campos obrigatórios dos criativos.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: config.name,
      objective: config.objective,
      status: "draft",
      accountId: config.accountId ? Number(config.accountId) : null,
      pageId: config.pageId ? Number(config.pageId) : null,
      instagramId: config.instagramId ? Number(config.instagramId) : null,
      whatsappId: config.whatsappId ? Number(config.whatsappId) : null,
      leadformId: config.leadformId ? Number(config.leadformId) : null,
      adSets: adSets.map((adSet) => ({
        audienceId: Number(adSet.audienceId),
        budget: adSet.budget,
        startDate: adSet.startDate || null,
        endDate: adSet.endDate || null,
      })),
      creatives: creatives.map((creative) => ({
        title: creative.title,
        text: creative.text,
        driveFolderId: creative.driveFolderId || null,
      })),
    };

    createMutation.mutate(payload);
  };

  const nextStep = () => {
    if (currentStep === 1 && !isStep1Valid()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha Conta Meta Ads, Nome e Objetivo.",
        variant: "destructive",
      });
      return;
    }
    if (currentStep === 2 && !isStep2Valid()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha Público e Orçamento para todos os conjuntos.",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Nova Campanha</h1>
        <p className="text-muted-foreground">
          Crie uma nova campanha seguindo os passos abaixo
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                currentStep >= step
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted text-muted-foreground"
              }`}
              data-testid={`step-indicator-${step}`}
            >
              {currentStep > step ? <Check className="h-5 w-5" /> : step}
            </div>
            {step < 3 && (
              <div
                className={`h-1 w-20 mx-2 ${
                  currentStep > step ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Campaign Configuration */}
      {currentStep === 1 && (
        <Card data-testid="step-1-configuration">
          <CardHeader>
            <CardTitle>Configuração da Campanha</CardTitle>
            <CardDescription>
              Defina a conta, nome e objetivo da campanha
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountId">
                Conta Meta Ads <span className="text-destructive">*</span>
              </Label>
              <Select
                value={config.accountId}
                onValueChange={(value) => setConfig({ ...config, accountId: value })}
              >
                <SelectTrigger id="accountId" data-testid="select-account">
                  <SelectValue placeholder="Selecione a conta" />
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
              <Label htmlFor="name">
                Nome da Campanha <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                data-testid="input-name"
                placeholder="Ex: Campanha de Lançamento 2025"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objective">
                Objetivo <span className="text-destructive">*</span>
              </Label>
              <Select
                value={config.objective}
                onValueChange={(value) => setConfig({ ...config, objective: value })}
              >
                <SelectTrigger id="objective" data-testid="select-objective">
                  <SelectValue placeholder="Selecione o objetivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEAD">Geração de Leads</SelectItem>
                  <SelectItem value="TRAFFIC">Tráfego</SelectItem>
                  <SelectItem value="WHATSAPP">Mensagens WhatsApp</SelectItem>
                  <SelectItem value="CONVERSIONS">Conversões</SelectItem>
                  <SelectItem value="REACH">Alcance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pageId">Página Facebook</Label>
                <Select
                  value={config.pageId}
                  onValueChange={(value) => setConfig({ ...config, pageId: value })}
                >
                  <SelectTrigger id="pageId" data-testid="select-page">
                    <SelectValue placeholder="Selecione a página" />
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

              <div className="space-y-2">
                <Label htmlFor="instagramId">Instagram</Label>
                <Select
                  value={config.instagramId}
                  onValueChange={(value) => setConfig({ ...config, instagramId: value })}
                >
                  <SelectTrigger id="instagramId" data-testid="select-instagram">
                    <SelectValue placeholder="Selecione o Instagram" />
                  </SelectTrigger>
                  <SelectContent>
                    {instagrams.map((instagram) => (
                      <SelectItem key={instagram.id} value={String(instagram.id)}>
                        {instagram.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsappId">WhatsApp</Label>
                <Select
                  value={config.whatsappId}
                  onValueChange={(value) => setConfig({ ...config, whatsappId: value })}
                >
                  <SelectTrigger id="whatsappId" data-testid="select-whatsapp">
                    <SelectValue placeholder="Selecione o WhatsApp" />
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

              <div className="space-y-2">
                <Label htmlFor="leadformId">Formulário de Leads</Label>
                <Select
                  value={config.leadformId}
                  onValueChange={(value) => setConfig({ ...config, leadformId: value })}
                >
                  <SelectTrigger id="leadformId" data-testid="select-leadform">
                    <SelectValue placeholder="Selecione o formulário" />
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Ad Sets */}
      {currentStep === 2 && (
        <div className="space-y-4" data-testid="step-2-adsets">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Conjuntos de Anúncios</CardTitle>
                  <CardDescription>
                    Defina público, orçamento e datas de veiculação
                  </CardDescription>
                </div>
                <Button onClick={addAdSet} variant="outline" size="sm" data-testid="button-add-adset">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Conjunto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {adSets.map((adSet, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4" data-testid={`adset-${index}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Conjunto {index + 1}</h3>
                    {adSets.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAdSet(index)}
                        data-testid={`button-remove-adset-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`audience-${index}`}>
                        Público <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={adSet.audienceId}
                        onValueChange={(value) => updateAdSet(index, "audienceId", value)}
                      >
                        <SelectTrigger id={`audience-${index}`} data-testid={`select-audience-${index}`}>
                          <SelectValue placeholder="Selecione o público" />
                        </SelectTrigger>
                        <SelectContent>
                          {audiences.map((audience) => (
                            <SelectItem key={audience.id} value={String(audience.id)}>
                              {audience.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`budget-${index}`}>
                        Orçamento (R$) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`budget-${index}`}
                        data-testid={`input-budget-${index}`}
                        type="number"
                        placeholder="0.00"
                        value={adSet.budget}
                        onChange={(e) => updateAdSet(index, "budget", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`startDate-${index}`}>Data de Início</Label>
                      <Input
                        id={`startDate-${index}`}
                        data-testid={`input-start-date-${index}`}
                        type="date"
                        value={adSet.startDate}
                        onChange={(e) => updateAdSet(index, "startDate", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`endDate-${index}`}>Data de Término</Label>
                      <Input
                        id={`endDate-${index}`}
                        data-testid={`input-end-date-${index}`}
                        type="date"
                        value={adSet.endDate}
                        onChange={(e) => updateAdSet(index, "endDate", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Creatives */}
      {currentStep === 3 && (
        <div className="space-y-4" data-testid="step-3-creatives">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Criativos</CardTitle>
                  <CardDescription>
                    Defina título, texto e pasta do Google Drive
                  </CardDescription>
                </div>
                <Button onClick={addCreative} variant="outline" size="sm" data-testid="button-add-creative">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Criativo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {creatives.map((creative, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4" data-testid={`creative-${index}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Criativo {index + 1}</h3>
                    {creatives.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCreative(index)}
                        data-testid={`button-remove-creative-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`title-${index}`}>
                        Título <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`title-${index}`}
                        data-testid={`input-title-${index}`}
                        placeholder="Digite o título do anúncio"
                        value={creative.title}
                        onChange={(e) => updateCreative(index, "title", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`text-${index}`}>
                        Texto <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id={`text-${index}`}
                        data-testid={`input-text-${index}`}
                        placeholder="Digite o texto do anúncio"
                        value={creative.text}
                        onChange={(e) => updateCreative(index, "text", e.target.value)}
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`driveFolderId-${index}`}>Pasta Google Drive</Label>
                      <Select
                        value={creative.driveFolderId}
                        onValueChange={(value) => updateCreative(index, "driveFolderId", value)}
                      >
                        <SelectTrigger id={`driveFolderId-${index}`} data-testid={`select-drive-folder-${index}`}>
                          <SelectValue placeholder="Selecione a pasta" />
                        </SelectTrigger>
                        <SelectContent>
                          {driveFolders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.value}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 1}
          data-testid="button-prev"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>

        {currentStep < 3 ? (
          <Button onClick={nextStep} data-testid="button-next">
            Próximo
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-create-draft"
          >
            {createMutation.isPending ? "Criando..." : "Criar Rascunho"}
          </Button>
        )}
      </div>
    </div>
  );
}
