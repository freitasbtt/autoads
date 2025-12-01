import { useEffect, useState } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { DriveFolderCombobox } from "@/components/DriveFolderCombobox";
import type { Resource } from "@shared/schema";

function extractPageInstagram(resource?: Resource | null): {
  instagramResourceId: number | null;
  handle: string | null;
} {
  const metadata = (resource?.metadata ?? {}) as Record<string, unknown>;
  const instagramResourceIdRaw = (metadata as any)?.instagramResourceId;
  const instagramResourceId =
    typeof instagramResourceIdRaw === "number"
      ? instagramResourceIdRaw
      : typeof instagramResourceIdRaw === "string" && instagramResourceIdRaw.trim().length > 0
        ? Number.parseInt(instagramResourceIdRaw, 10)
        : null;

  const instagramUsername =
    typeof metadata.instagramUsername === "string" ? metadata.instagramUsername : null;
  const instagramId = typeof metadata.instagramId === "string" ? metadata.instagramId : null;

  const normalizedUsername =
    instagramUsername && instagramUsername.startsWith("@")
      ? instagramUsername.slice(1)
      : instagramUsername;

  const handle = normalizedUsername
    ? `@${normalizedUsername}`
    : instagramId
      ? instagramId
      : null;

  return { instagramResourceId, handle };
}

export default function ExistingCampaignForm() {
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string>("");
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
  const openDriveFolderManager = () => {
    window.open("/resources?type=drive_folder&new=1", "_blank", "noopener");
  };

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

  const adAccounts = resources.filter((r) => r.type === "account");
  const pages = resources.filter((r) => r.type === "page");
  const whatsappNumbers = resources.filter((r) => r.type === "whatsapp");
  const driveFolders = resources.filter((r) => r.type === "drive_folder");
  const selectedPageResource = pages.find((page) => String(page.id) === pageId);
  const selectedPageValue = selectedPageResource?.value ?? "";
  const pageInstagram = extractPageInstagram(selectedPageResource);

  useEffect(() => {
    const derivedInstagramId = pageInstagram.instagramResourceId
      ? String(pageInstagram.instagramResourceId)
      : "";
    setInstagramId(derivedInstagramId);
    setLeadFormId("");
  }, [pageInstagram.instagramResourceId, selectedPageValue]);

  const {
    data: leadForms = [],
    isFetching: isFetchingLeadForms,
  } = useQuery<Resource[]>({
    queryKey: ["leadforms-by-page", selectedPageValue],
    enabled: Boolean(selectedPageValue),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/meta/pages/${selectedPageValue}/leadforms`);
      return (await res.json()) as Resource[];
    },
  });

  const createDraftMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiRequest("POST", "/api/campaigns", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Rascunho criado!",
        description: "A campanha foi salva como rascunho com sucesso.",
      });
      // Small delay to allow toast to appear before navigation
      setTimeout(() => {
        setLocation("/campaigns");
      }, 100);
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

    if (!accountId || !pageId || !instagramId || !driveFolderId || !title || !message) {
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

    const normalizedTitle = title.trim();
    const normalizedMessage = message.trim();

    // Create campaign as draft matching InsertCampaignSchema
    // Use the title as campaign name for better visibility
    const payload = {
      name: normalizedTitle, // Use creative title as campaign name
      objective: selectedObjectives[0], // Use first objective as primary
      status: "draft",
      accountId: accountId ? Number(accountId) : undefined,
      pageId: pageId ? Number(pageId) : undefined,
      instagramId: instagramId ? Number(instagramId) : undefined,
      whatsappId: whatsappId ? Number(whatsappId) : undefined,
      leadformId: leadFormId ? Number(leadFormId) : undefined,
      websiteUrl: websiteUrl || undefined,
      driveFolderId: driveFolderId || undefined,
      title: normalizedTitle || undefined,
      message: normalizedMessage || undefined,
      adSets: [], // Empty for existing campaign form
      creatives: [
        {
          title: normalizedTitle,
          text: normalizedMessage,
          driveFolderId: driveFolderId,
        },
      ],
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
            <div className="space-y-2">
              <Label htmlFor="account">Conta Meta Ads *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="account" data-testid="select-account">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {adAccounts.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma conta disponivel
                    </SelectItem>
                  ) : (
                    adAccounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

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
                        <SelectItem key={page.id} value={String(page.id)}>
                          {page.name}
                          {extractPageInstagram(page).handle
                            ? ` (${extractPageInstagram(page).handle})`
                            : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram vinculado *</Label>
                <Select
                  value={instagramId}
                  onValueChange={setInstagramId}
                  disabled={!selectedPageValue || !pageInstagram.instagramResourceId}
                >
                  <SelectTrigger id="instagram" data-testid="select-instagram">
                    <SelectValue
                      placeholder={
                        !selectedPageValue
                          ? "Selecione uma pagina primeiro"
                          : pageInstagram.instagramResourceId
                            ? "Selecione"
                            : "Nenhum Instagram associado"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedPageValue ? (
                      <SelectItem value="none" disabled>
                        Selecione uma pagina primeiro
                      </SelectItem>
                    ) : pageInstagram.instagramResourceId ? (
                      <SelectItem value={String(pageInstagram.instagramResourceId)}>
                        {pageInstagram.handle ?? "Instagram vinculado"}
                      </SelectItem>
                    ) : (
                      <SelectItem value="none" disabled>
                        Nenhum Instagram associado
                      </SelectItem>
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
                        <SelectItem key={whatsapp.id} value={String(whatsapp.id)}>
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
                <Label htmlFor="leadform">Formulario de Leads *</Label>
                <Select
                  value={leadFormId}
                  onValueChange={setLeadFormId}
                  disabled={!selectedPageValue || isFetchingLeadForms}
                >
                  <SelectTrigger id="leadform" data-testid="select-leadform">
                    <SelectValue
                      placeholder={
                        !selectedPageValue
                          ? "Selecione uma pagina primeiro"
                          : isFetchingLeadForms
                            ? "Carregando formularios..."
                            : "Selecione"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedPageValue ? (
                      <SelectItem value="none" disabled>
                        Selecione uma pagina primeiro
                      </SelectItem>
                    ) : isFetchingLeadForms ? (
                      <SelectItem value="none" disabled>
                        Carregando formularios...
                      </SelectItem>
                    ) : leadForms.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum formulario disponivel
                      </SelectItem>
                    ) : (
                      leadForms.map((form) => (
                        <SelectItem key={form.id} value={String(form.id)}>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
                <Button
                  type="button"
                  variant="link"
                  className="px-0"
                  onClick={openDriveFolderManager}
                >
                  Nova pasta
                </Button>
              </div>
              <DriveFolderCombobox
                folders={driveFolders}
                value={driveFolderId}
                onChange={setDriveFolderId}
                placeholder="Buscar pasta por nome"
                emptyLabel="Nenhuma pasta disponivel"
                testId="select-drive-folder"
              />
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


