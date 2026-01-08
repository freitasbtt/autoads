import { useCallback, useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus } from "lucide-react";
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
  const [isWhatsappDialogOpen, setIsWhatsappDialogOpen] = useState(false);
  const [newWhatsappName, setNewWhatsappName] = useState("");
  const [newWhatsappValue, setNewWhatsappValue] = useState("");
  const [newWhatsappPageId, setNewWhatsappPageId] = useState<string>("");
  const [isLeadFormDialogOpen, setIsLeadFormDialogOpen] = useState(false);
  const [newLeadFormName, setNewLeadFormName] = useState("");
  const [newLeadFormValue, setNewLeadFormValue] = useState("");
  const [newLeadFormPageId, setNewLeadFormPageId] = useState<string>("");
  
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const openDriveFolderManager = () => {
    window.open("/resources?type=drive_folder&new=1", "_blank", "noopener");
  };
  const openWhatsappDialog = () => {
    if (!pageId) {
      toast({
        title: "Selecione uma pagina",
        description: "Escolha uma pagina antes de cadastrar um numero.",
        variant: "destructive",
      });
      return;
    }
    setNewWhatsappPageId(pageId);
    setNewWhatsappName("");
    setNewWhatsappValue("");
    setIsWhatsappDialogOpen(true);
  };
  const openLeadFormDialog = () => {
    if (!pageId) {
      toast({
        title: "Selecione uma pagina",
        description: "Escolha uma pagina antes de cadastrar o formulario.",
        variant: "destructive",
      });
      return;
    }
    setNewLeadFormPageId(pageId);
    setNewLeadFormName("");
    setNewLeadFormValue("");
    setIsLeadFormDialogOpen(true);
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
  const searchDriveFolders = useCallback(
    async (query: string) => {
      const res = await apiRequest(
        "GET",
        `/api/drive/folders?query=${encodeURIComponent(query)}&limit=10`,
      );
      const data = (await res.json()) as Array<{ id: string; name: string }>;
      return data.map((folder) => ({
        id: folder.id,
        name: folder.name,
        value: folder.id,
        searchText: `${folder.name} ${folder.id}`.trim(),
      }));
    },
    [],
  );
  const accountOptions = adAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    value: String(account.id),
    searchText: `${account.name} ${account.value}`.trim(),
  }));
  const pageOptions = pages.map((page) => {
    const handle = extractPageInstagram(page).handle;
    const label = handle ? `${page.name} (${handle})` : page.name;
    return {
      id: page.id,
      name: label,
      value: String(page.id),
      searchText: `${page.name} ${handle ?? ""} ${page.value}`.trim(),
    };
  });
  const selectedPageResource = pages.find((page) => String(page.id) === pageId);
  const selectedPageValue = selectedPageResource?.value ?? "";
  const pageInstagram = extractPageInstagram(selectedPageResource);
  const filteredWhatsappNumbers = selectedPageValue
    ? whatsappNumbers.filter((whatsapp) => {
        const metadata = (whatsapp.metadata ?? {}) as Record<string, unknown>;
        const pageIdRaw = metadata.pageId;
        const pageValueRaw = metadata.pageValue;
        const pageResourceIdRaw = metadata.pageResourceId;
        const pageId =
          typeof pageIdRaw === "string"
            ? pageIdRaw
            : typeof pageIdRaw === "number"
              ? String(pageIdRaw)
              : null;
        const pageValue =
          typeof pageValueRaw === "string"
            ? pageValueRaw
            : typeof pageValueRaw === "number"
              ? String(pageValueRaw)
              : null;
        const pageResourceId =
          typeof pageResourceIdRaw === "number"
            ? pageResourceIdRaw
            : typeof pageResourceIdRaw === "string"
              ? Number.parseInt(pageResourceIdRaw, 10)
              : null;

        if (pageId && pageId === selectedPageValue) return true;
        if (pageValue && pageValue === selectedPageValue) return true;
        if (
          typeof pageResourceId === "number" &&
          Number.isFinite(pageResourceId) &&
          selectedPageResource &&
          pageResourceId === selectedPageResource.id
        ) {
          return true;
        }
        return false;
      })
    : [];

  useEffect(() => {
    const derivedInstagramId = pageInstagram.instagramResourceId
      ? String(pageInstagram.instagramResourceId)
      : "";
    setInstagramId(derivedInstagramId);
    setLeadFormId("");
    setWhatsappId("");
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
  const manualLeadForms = selectedPageValue
    ? resources.filter((leadform) => {
        if (leadform.type !== "leadform") return false;
        const metadata = (leadform.metadata ?? {}) as Record<string, unknown>;
        const pageIdRaw = metadata.pageId;
        const pageValueRaw = metadata.pageValue;
        const pageResourceIdRaw = metadata.pageResourceId;
        const pageId =
          typeof pageIdRaw === "string"
            ? pageIdRaw
            : typeof pageIdRaw === "number"
              ? String(pageIdRaw)
              : null;
        const pageValue =
          typeof pageValueRaw === "string"
            ? pageValueRaw
            : typeof pageValueRaw === "number"
              ? String(pageValueRaw)
              : null;
        const pageResourceId =
          typeof pageResourceIdRaw === "number"
            ? pageResourceIdRaw
            : typeof pageResourceIdRaw === "string"
              ? Number.parseInt(pageResourceIdRaw, 10)
              : null;

        if (pageId && pageId === selectedPageValue) return true;
        if (pageValue && pageValue === selectedPageValue) return true;
        if (
          typeof pageResourceId === "number" &&
          Number.isFinite(pageResourceId) &&
          selectedPageResource &&
          pageResourceId === selectedPageResource.id
        ) {
          return true;
        }
        return false;
      })
    : [];
  const mergedLeadForms = (() => {
    const byId = new Map<number, Resource>();
    leadForms.forEach((form) => {
      if (typeof form.id === "number" && !byId.has(form.id)) {
        byId.set(form.id, form);
      }
    });
    manualLeadForms.forEach((form) => {
      if (typeof form.id === "number" && !byId.has(form.id)) {
        byId.set(form.id, form);
      }
    });
    return Array.from(byId.values());
  })();


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

  const createWhatsappMutation = useMutation({
    mutationFn: async (payload: {
      type: "whatsapp";
      name: string;
      value: string;
      metadata: Record<string, unknown>;
    }) => {
      const res = await apiRequest("POST", "/api/resources", payload);
      return (await res.json()) as Resource;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setWhatsappId(String(created.id));
      setIsWhatsappDialogOpen(false);
      setNewWhatsappName("");
      setNewWhatsappValue("");
      setNewWhatsappPageId("");
      toast({
        title: "Numero cadastrado",
        description: "O numero de WhatsApp foi salvo com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao cadastrar numero",
        description: error?.message || "Nao foi possivel cadastrar o numero.",
        variant: "destructive",
      });
    },
  });

  const createLeadFormMutation = useMutation({
    mutationFn: async (payload: {
      type: "leadform";
      name: string;
      value: string;
      metadata: Record<string, unknown>;
    }) => {
      const res = await apiRequest("POST", "/api/resources", payload);
      return (await res.json()) as Resource;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      if (selectedPageValue) {
        await queryClient.invalidateQueries({
          queryKey: ["leadforms-by-page", selectedPageValue],
        });
      }
      setLeadFormId(String(created.id));
      setIsLeadFormDialogOpen(false);
      setNewLeadFormName("");
      setNewLeadFormValue("");
      setNewLeadFormPageId("");
      toast({
        title: "Formulario cadastrado",
        description: "O formulario de leads foi salvo com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao cadastrar formulario",
        description: error?.message || "Nao foi possivel cadastrar o formulario.",
        variant: "destructive",
      });
    },
  });

  const handleCreateWhatsapp = () => {
    const name = newWhatsappName.trim();
    const value = newWhatsappValue.trim();
    if (!name || !value) {
      toast({
        title: "Campos obrigatorios",
        description: "Informe nome e WhatsApp Number ID.",
        variant: "destructive",
      });
      return;
    }
    if (!newWhatsappPageId) {
      toast({
        title: "Selecione uma pagina",
        description: "Associe o numero a uma pagina.",
        variant: "destructive",
      });
      return;
    }
    const pageResource = pages.find((page) => String(page.id) === newWhatsappPageId);
    if (!pageResource) {
      toast({
        title: "Pagina invalida",
        description: "Pagina selecionada nao encontrada.",
        variant: "destructive",
      });
      return;
    }

    createWhatsappMutation.mutate({
      type: "whatsapp",
      name,
      value,
      metadata: {
        pageResourceId: pageResource.id,
        pageId: pageResource.value,
        pageName: pageResource.name,
      },
    });
  };

  const handleCreateLeadForm = () => {
    const name = newLeadFormName.trim();
    const value = newLeadFormValue.trim();
    if (!name || !value) {
      toast({
        title: "Campos obrigatorios",
        description: "Informe nome e Formulario ID.",
        variant: "destructive",
      });
      return;
    }
    if (!newLeadFormPageId) {
      toast({
        title: "Selecione uma pagina",
        description: "Associe o formulario a uma pagina.",
        variant: "destructive",
      });
      return;
    }
    const pageResource = pages.find((page) => String(page.id) === newLeadFormPageId);
    if (!pageResource) {
      toast({
        title: "Pagina invalida",
        description: "Pagina selecionada nao encontrada.",
        variant: "destructive",
      });
      return;
    }

    createLeadFormMutation.mutate({
      type: "leadform",
      name,
      value,
      metadata: {
        pageResourceId: pageResource.id,
        pageId: pageResource.value,
        pageName: pageResource.name,
        source: "manual",
      },
    });
  };

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
              <DriveFolderCombobox
                folders={accountOptions}
                value={accountId}
                onChange={setAccountId}
                placeholder="Buscar conta por nome"
                emptyLabel="Nenhuma conta disponivel"
                maxResults={50}
                testId="select-account"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page">P?gina Facebook *</Label>
                <DriveFolderCombobox
                  folders={pageOptions}
                  value={pageId}
                  onChange={setPageId}
                  placeholder="Buscar pagina por nome"
                  emptyLabel="Nenhuma pagina disponivel"
                  maxResults={50}
                  testId="select-page"
                />
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="whatsapp">WhatsApp Number ID *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={openWhatsappDialog}
                  >
                    <Plus className="h-4 w-4" />
                    Novo numero
                  </Button>
                </div>
                <Select
                  value={whatsappId}
                  onValueChange={setWhatsappId}
                  disabled={!selectedPageValue}
                >
                  <SelectTrigger id="whatsapp" data-testid="select-whatsapp">
                    <SelectValue
                      placeholder={
                        !selectedPageValue ? "Selecione uma pagina primeiro" : "Selecione"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedPageValue ? (
                      <SelectItem value="none" disabled>
                        Selecione uma pagina primeiro
                      </SelectItem>
                    ) : filteredWhatsappNumbers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum numero WhatsApp disponivel para esta pagina
                      </SelectItem>
                    ) : (
                      filteredWhatsappNumbers.map((whatsapp) => (
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="leadform">Formulario de Leads *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={openLeadFormDialog}
                  >
                    <Plus className="h-4 w-4" />
                    Novo formulario
                  </Button>
                </div>
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
                    ) : mergedLeadForms.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum formulario disponivel
                      </SelectItem>
                    ) : (
                      mergedLeadForms.map((form) => (
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
                onSearch={searchDriveFolders}
                minSearchLength={3}
                maxResults={10}
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

      <Dialog open={isWhatsappDialogOpen} onOpenChange={setIsWhatsappDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo numero WhatsApp</DialogTitle>
            <DialogDescription>
              Cadastre o numero e associe a uma pagina.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-page">Pagina associada</Label>
              <Select value={newWhatsappPageId} onValueChange={setNewWhatsappPageId}>
                <SelectTrigger id="whatsapp-page" data-testid="select-whatsapp-page">
                  <SelectValue placeholder="Selecione a pagina" />
                </SelectTrigger>
                <SelectContent>
                  {pages.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma pagina disponivel
                    </SelectItem>
                  ) : (
                    pages.map((page) => (
                      <SelectItem key={page.id} value={String(page.id)}>
                        {page.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp-name">Nome</Label>
              <Input
                id="whatsapp-name"
                placeholder="Ex: WhatsApp Atendimento"
                value={newWhatsappName}
                onChange={(e) => setNewWhatsappName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp-number-id">WhatsApp Number ID</Label>
              <Input
                id="whatsapp-number-id"
                placeholder="Ex: 123456789012345"
                value={newWhatsappValue}
                onChange={(e) => setNewWhatsappValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsWhatsappDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateWhatsapp}
              disabled={createWhatsappMutation.isPending}
            >
              {createWhatsappMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLeadFormDialogOpen} onOpenChange={setIsLeadFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo formulario de leads</DialogTitle>
            <DialogDescription>
              Cadastre o formulario e associe a uma pagina.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="leadform-page">Pagina associada</Label>
              <Select value={newLeadFormPageId} onValueChange={setNewLeadFormPageId}>
                <SelectTrigger id="leadform-page" data-testid="select-leadform-page">
                  <SelectValue placeholder="Selecione a pagina" />
                </SelectTrigger>
                <SelectContent>
                  {pages.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma pagina disponivel
                    </SelectItem>
                  ) : (
                    pages.map((page) => (
                      <SelectItem key={page.id} value={String(page.id)}>
                        {page.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leadform-name">Nome</Label>
              <Input
                id="leadform-name"
                placeholder="Ex: Leads Campanha X"
                value={newLeadFormName}
                onChange={(e) => setNewLeadFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leadform-id">Formulario ID</Label>
              <Input
                id="leadform-id"
                placeholder="Ex: 123456789012345"
                value={newLeadFormValue}
                onChange={(e) => setNewLeadFormValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLeadFormDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateLeadForm}
              disabled={createLeadFormMutation.isPending}
            >
              {createLeadFormMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
