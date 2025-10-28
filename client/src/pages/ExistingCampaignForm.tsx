import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface Resource {
  id: number;
  type: string;
  name: string;
  value: string;
}

export default function ExistingCampaignForm() {
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [pageId, setPageId] = useState<string>("");
  const [instagramId, setInstagramId] = useState<string>("");
  const [whatsappId, setWhatsappId] = useState<string>("");
  const [leadFormId, setLeadFormId] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [driveFolderId, setDriveFolderId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: resources = [], isLoading: loadingResources } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const objectives = [
    { value: "LEAD", label: "Geração de Leads", requiresLeadForm: true },
    { value: "TRAFFIC", label: "Tráfego", requiresWebsite: true },
    { value: "WHATSAPP", label: "WhatsApp", requiresWhatsApp: true },
    { value: "CONVERSIONS", label: "Conversões" },
    { value: "REACH", label: "Alcance" },
  ];

  const toggleObjective = (value: string) => {
    setSelectedObjectives((prev) =>
      prev.includes(value) ? prev.filter((o) => o !== value) : [...prev, value]
    );
  };

  const needsLeadForm = selectedObjectives.includes("LEAD");
  const needsWebsite = selectedObjectives.includes("TRAFFIC");
  const needsWhatsApp = selectedObjectives.includes("WHATSAPP");

  const pages = resources.filter((r) => r.type === "page");
  const instagramAccounts = resources.filter((r) => r.type === "instagram");
  const whatsappNumbers = resources.filter((r) => r.type === "whatsapp");
  const leadForms = resources.filter((r) => r.type === "leadform");
  const driveFolders = resources.filter((r) => r.type === "drive_folder");

  const createDraftMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiRequest("POST", "/api/campaigns", payload);
    },
    onSuccess: () => {
      toast({
        title: "Rascunho criado!",
        description: "A campanha foi salva como rascunho com sucesso.",
      });
      setLocation("/campaigns");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar rascunho",
        description: error.message || "Não foi possível criar o rascunho",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!pageId || !instagramId || !driveFolderId || !title || !message) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    if (selectedObjectives.length === 0) {
      toast({
        title: "Selecione pelo menos um objetivo",
        description: "É necessário selecionar ao menos um objetivo para a campanha",
        variant: "destructive",
      });
      return;
    }

    if (needsWhatsApp && !whatsappId) {
      toast({
        title: "WhatsApp obrigatório",
        description: "Objetivo WhatsApp requer um número WhatsApp",
        variant: "destructive",
      });
      return;
    }

    if (needsLeadForm && !leadFormId) {
      toast({
        title: "Formulário obrigatório",
        description: "Objetivo de Leads requer um formulário de leads",
        variant: "destructive",
      });
      return;
    }

    if (needsWebsite && !websiteUrl) {
      toast({
        title: "Website obrigatório",
        description: "Objetivo de Tráfego requer uma URL de website",
        variant: "destructive",
      });
      return;
    }

    const selectedPage = pages.find((p) => p.id === Number(pageId));
    const selectedInstagram = instagramAccounts.find((i) => i.id === Number(instagramId));
    const selectedWhatsApp = whatsappNumbers.find((w) => w.id === Number(whatsappId));
    const selectedLeadForm = leadForms.find((lf) => lf.id === Number(leadFormId));

    // Create campaign as draft
    const payload = {
      name: `Campanha ${selectedObjectives.join(", ")} - ${new Date().toLocaleDateString()}`,
      objective: selectedObjectives[0], // Use first objective as primary
      status: "draft",
      pageId: selectedPage?.id || null,
      instagramId: selectedInstagram?.id || null,
      whatsappId: selectedWhatsApp?.id || null,
      leadformId: selectedLeadForm?.id || null,
      websiteUrl: websiteUrl || null,
      creatives: [{
        title,
        text: message,
        driveFolderId: driveFolderId,
      }],
    };

    createDraftMutation.mutate(payload);
  };

  if (loadingResources) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Adicionar a Campanha Existente</h1>
        <p className="text-muted-foreground">
          Adicione novos anúncios a campanhas já criadas no Meta Ads
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Objetivos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Selecione um ou mais objetivos para esta campanha
            </p>
            {objectives.map((objective) => (
              <div key={objective.value} className="flex items-center space-x-2">
                <Checkbox
                  id={objective.value}
                  checked={selectedObjectives.includes(objective.value)}
                  onCheckedChange={() => toggleObjective(objective.value)}
                  data-testid={`checkbox-objective-${objective.value.toLowerCase()}`}
                />
                <Label htmlFor={objective.value} className="cursor-pointer">
                  {objective.label}
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page">Página Facebook *</Label>
                <Select value={pageId} onValueChange={setPageId}>
                  <SelectTrigger id="page" data-testid="select-page">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhuma página disponível
                      </SelectItem>
                    ) : (
                      pages.map((page) => (
                        <SelectItem key={page.id} value={page.value}>
                          {page.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram User ID *</Label>
                <Select value={instagramId} onValueChange={setInstagramId}>
                  <SelectTrigger id="instagram" data-testid="select-instagram">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {instagramAccounts.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhuma conta Instagram disponível
                      </SelectItem>
                    ) : (
                      instagramAccounts.map((instagram) => (
                        <SelectItem key={instagram.id} value={instagram.value}>
                          {instagram.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsWhatsApp && (
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Number ID *</Label>
                <Select value={whatsappId} onValueChange={setWhatsappId}>
                  <SelectTrigger id="whatsapp" data-testid="select-whatsapp">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappNumbers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum número WhatsApp disponível
                      </SelectItem>
                    ) : (
                      whatsappNumbers.map((whatsapp) => (
                        <SelectItem key={whatsapp.id} value={whatsapp.value}>
                          {whatsapp.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsLeadForm && (
              <div className="space-y-2">
                <Label htmlFor="leadform">Formulário de Leads *</Label>
                <Select value={leadFormId} onValueChange={setLeadFormId}>
                  <SelectTrigger id="leadform" data-testid="select-leadform">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadForms.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum formulário disponível
                      </SelectItem>
                    ) : (
                      leadForms.map((form) => (
                        <SelectItem key={form.id} value={form.value}>
                          {form.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsWebsite && (
              <div className="space-y-2">
                <Label htmlFor="website">Website URL *</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://exemplo.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  data-testid="input-website"
                />
              </div>
            )}
          </CardContent>
        </Card>

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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Texto Principal *</Label>
              <Textarea
                id="message"
                placeholder="Mensagem do anúncio"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                data-testid="input-message"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
              <Select value={driveFolderId} onValueChange={setDriveFolderId}>
                <SelectTrigger id="drive-folder" data-testid="select-drive-folder">
                  <SelectValue placeholder="Selecione a pasta com criativos" />
                </SelectTrigger>
                <SelectContent>
                  {driveFolders.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma pasta disponível
                    </SelectItem>
                  ) : (
                    driveFolders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.value}>
                        {folder.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => setLocation("/campaigns")}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createDraftMutation.isPending}
            data-testid="button-submit"
          >
            {createDraftMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Rascunho"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
