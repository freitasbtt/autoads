import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronRight, ChevronLeft, Plus, Trash2, Check } from "lucide-react";
import { Resource, Audience } from "@shared/schema";

const OBJECTIVE_OPTIONS: Record<
  string,
  { label: string; objective: string; optimizationGoal: string }
> = {
  leads: {
    label: "Geração de Leads",
    objective: "OUTCOME_LEADS",
    optimizationGoal: "LEAD_GENERATION",
  },
  whatsapp: {
    label: "Mensagens WhatsApp",
    objective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "CONVERSATIONS",
  },
  traffic: {
    label: "Tráfego",
    objective: "OUTCOME_TRAFFIC",
    optimizationGoal: "LINK_CLICKS",
  },
  conversions: {
    label: "Conversões",
    objective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
  },
  awareness: {
    label: "Alcance",
    objective: "OUTCOME_AWARENESS",
    optimizationGoal: "IMPRESSIONS",
  },
};

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
  mode?: "manual" | "existing_post";
  postId?: string;
  objectStoryId?: string;
  permalinkUrl?: string;
  postMessage?: string;
}

type CreativeMode = "manual" | "existing_post";

interface PagePostSummary {
  id: string;
  message: string;
  created_time: string;
  likes: number;
  comments: number;
  shares: number;
  permalink_url: string;
}

export default function CampaignForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Campaign Configuration
  const [config, setConfig] = useState({
    accountId: "",
    name: "",
    objectiveKey: "",
    objective: "",
    optimizationGoal: "",
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
  const [creativeMode, setCreativeMode] = useState<CreativeMode>("manual");
  const [selectedPost, setSelectedPost] = useState<PagePostSummary | null>(
    null
  );
  const openDriveFolderManager = () => {
    window.open("/resources?type=drive_folder&new=1", "_blank", "noopener");
  };

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
  const selectedPageResource = pages.find(
    (page) => String(page.id) === config.pageId
  );
  const selectedPageValue = selectedPageResource?.value ?? "";

  const {
    data: pagePosts = [],
    isLoading: isLoadingPagePosts,
    isError: isPagePostsError,
    error: pagePostsError,
    refetch: refetchPagePosts,
  } = useQuery<PagePostSummary[]>({
    queryKey: ["page-posts", selectedPageValue],
    enabled: creativeMode === "existing_post" && Boolean(selectedPageValue),
    queryFn: async () => {
      const res = await fetch(
        `/api/meta/pages/${selectedPageValue}/posts?limit=20`,
        {
          credentials: "include",
        }
      );

      if (!res.ok) {
        const message = (await res.text()) || res.statusText;
        throw new Error(message);
      }

      return (await res.json()) as PagePostSummary[];
    },
  });

  useEffect(() => {
    if (creativeMode !== "existing_post") {
      setSelectedPost(null);
    }
  }, [creativeMode]);

  useEffect(() => {
    setSelectedPost(null);
  }, [selectedPageValue]);

  // Add/Remove Ad Set
  const addAdSet = () => {
    setAdSets([
      ...adSets,
      { audienceId: "", budget: "", startDate: "", endDate: "" },
    ]);
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

  const updateCreative = (
    index: number,
    field: keyof Creative,
    value: string
  ) => {
    const updated = [...creatives];
    updated[index][field] = value;
    setCreatives(updated);
  };

  // Validation for each step
  const isStep1Valid = () => {
    return config.accountId && config.name && config.objectiveKey;
  };

  const isStep2Valid = () => {
    return adSets.every((adSet) => adSet.audienceId && adSet.budget);
  };

  const isStep3Valid = () => {
    if (creativeMode === "existing_post") {
      return Boolean(selectedPageValue && selectedPost);
    }
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
        title: "Erro de validacao",
        description:
          creativeMode === "existing_post"
            ? "Selecione uma pagina e um post existente antes de continuar."
            : "Preencha todos os campos obrigatorios dos criativos.",
        variant: "destructive",
      });
      return;
    }

    const primaryCreative = creatives[0];
    const primaryTitle =
      creativeMode === "manual" ? primaryCreative?.title?.trim() ?? "" : "";
    const primaryMessage =
      creativeMode === "manual" ? primaryCreative?.text?.trim() ?? "" : "";
    const selectedPostMessage = selectedPost?.message?.trim() ?? "";
    const selectedPostId = selectedPost?.id ?? "";
    const selectedObjectStoryId =
      creativeMode === "existing_post" && selectedPost && selectedPageValue
        ? `${selectedPageValue}_${selectedPost.id}`
        : "";

    const creativePayload =
      creativeMode === "existing_post" && selectedPost && selectedPageValue
        ? [
            {
              mode: "existing_post",
              postId: selectedPostId,
              objectStoryId: selectedObjectStoryId,
              permalinkUrl: selectedPost.permalink_url ?? "",
              postMessage: selectedPost.message ?? "",
              createdTime: selectedPost.created_time ?? "",
              driveFolderId: null,
              stats: {
                likes: selectedPost.likes,
                comments: selectedPost.comments,
                shares: selectedPost.shares,
              },
            },
          ]
        : creatives.map((creative) => ({
            title: creative.title,
            text: creative.text,
            driveFolderId: creative.driveFolderId || null,
            mode: "manual",
          }));

    const finalTitle =
      creativeMode === "existing_post"
        ? selectedPostMessage || primaryTitle
        : primaryTitle;
    const finalMessage =
      creativeMode === "existing_post"
        ? selectedPostMessage || primaryMessage
        : primaryMessage;

    const payload = {
      name: config.name,
      objective: config.objective,
      status: "draft",
      accountId: config.accountId ? Number(config.accountId) : null,
      pageId: config.pageId ? Number(config.pageId) : null,
      instagramId: config.instagramId ? Number(config.instagramId) : null,
      whatsappId: config.whatsappId ? Number(config.whatsappId) : null,
      leadformId: config.leadformId ? Number(config.leadformId) : null,
      title: finalTitle || undefined,
      message: finalMessage || undefined,
      adSets: adSets.map((adSet) => ({
        audienceId: Number(adSet.audienceId),
        budget: adSet.budget,
        startDate: adSet.startDate || null,
        endDate: adSet.endDate || null,
        optimizationGoal: config.optimizationGoal,
      })),
      creatives: creativePayload,
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

  const formatPostDate = (isoString: string) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncateMessage = (value: string, limit = 90) => {
    if (!value) return "Sem texto";
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  };

  const postsErrorMessage =
    pagePostsError instanceof Error
      ? pagePostsError.message
      : "Nao foi possivel carregar os posts da pagina.";

  const selectedObjectStoryPreview =
    creativeMode === "existing_post" && selectedPost && selectedPageValue
      ? `${selectedPageValue}_${selectedPost.id}`
      : "";

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
                onValueChange={(value) =>
                  setConfig({ ...config, accountId: value })
                }
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
                value={config.objectiveKey}
                onValueChange={(value) => {
                  const mapping = OBJECTIVE_OPTIONS[value];
                  setConfig((prev) => ({
                    ...prev,
                    objectiveKey: value,
                    objective: mapping?.objective ?? "",
                    optimizationGoal: mapping?.optimizationGoal ?? "",
                  }));
                }}
              >
                <SelectTrigger id="objective" data-testid="select-objective">
                  <SelectValue placeholder="Selecione o objetivo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJECTIVE_OPTIONS).map(([key, option]) => (
                    <SelectItem key={key} value={key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pageId">Página Facebook</Label>
                <Select
                  value={config.pageId}
                  onValueChange={(value) =>
                    setConfig({ ...config, pageId: value })
                  }
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
                  onValueChange={(value) =>
                    setConfig({ ...config, instagramId: value })
                  }
                >
                  <SelectTrigger
                    id="instagramId"
                    data-testid="select-instagram"
                  >
                    <SelectValue placeholder="Selecione o Instagram" />
                  </SelectTrigger>
                  <SelectContent>
                    {instagrams.map((instagram) => (
                      <SelectItem
                        key={instagram.id}
                        value={String(instagram.id)}
                      >
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
                  onValueChange={(value) =>
                    setConfig({ ...config, whatsappId: value })
                  }
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
                  onValueChange={(value) =>
                    setConfig({ ...config, leadformId: value })
                  }
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
                <Button
                  onClick={addAdSet}
                  variant="outline"
                  size="sm"
                  data-testid="button-add-adset"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Conjunto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {adSets.map((adSet, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 space-y-4"
                  data-testid={`adset-${index}`}
                >
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
                        onValueChange={(value) =>
                          updateAdSet(index, "audienceId", value)
                        }
                      >
                        <SelectTrigger
                          id={`audience-${index}`}
                          data-testid={`select-audience-${index}`}
                        >
                          <SelectValue placeholder="Selecione o público" />
                        </SelectTrigger>
                        <SelectContent>
                          {audiences.map((audience) => (
                            <SelectItem
                              key={audience.id}
                              value={String(audience.id)}
                            >
                              {audience.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`budget-${index}`}>
                        Orçamento (R$){" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`budget-${index}`}
                        data-testid={`input-budget-${index}`}
                        type="number"
                        placeholder="0.00"
                        value={adSet.budget}
                        onChange={(e) =>
                          updateAdSet(index, "budget", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`startDate-${index}`}>
                        Data de Início
                      </Label>
                      <Input
                        id={`startDate-${index}`}
                        data-testid={`input-start-date-${index}`}
                        type="date"
                        value={adSet.startDate}
                        onChange={(e) =>
                          updateAdSet(index, "startDate", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`endDate-${index}`}>
                        Data de Término
                      </Label>
                      <Input
                        id={`endDate-${index}`}
                        data-testid={`input-end-date-${index}`}
                        type="date"
                        value={adSet.endDate}
                        onChange={(e) =>
                          updateAdSet(index, "endDate", e.target.value)
                        }
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
            <Tabs
              value={creativeMode}
              onValueChange={(value) => setCreativeMode(value as CreativeMode)}
              className="w-full"
            >
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle>Criativos</CardTitle>
                    <CardDescription>
                      Defina titulo, texto e pasta ou reutilize um post da
                      pagina
                    </CardDescription>
                  </div>
                  {creativeMode === "manual" && (
                    <Button
                      onClick={addCreative}
                      variant="outline"
                      size="sm"
                      data-testid="button-add-creative"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Criativo
                    </Button>
                  )}
                </div>
                <TabsList className="flex w-full flex-wrap gap-2">
                  <TabsTrigger value="manual">Editor manual</TabsTrigger>
                  <TabsTrigger value="existing_post">
                    Use existing Page post (read-only)
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="manual" className="space-y-6">
                  {creatives.map((creative, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-4"
                      data-testid={`creative-${index}`}
                    >
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
                            Titulo <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id={`title-${index}`}
                            data-testid={`input-title-${index}`}
                            placeholder="Digite o titulo do anuncio"
                            value={creative.title}
                            onChange={(e) =>
                              updateCreative(index, "title", e.target.value)
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`text-${index}`}>
                            Texto <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id={`text-${index}`}
                            data-testid={`input-text-${index}`}
                            placeholder="Digite o texto do anuncio"
                            value={creative.text}
                            onChange={(e) =>
                              updateCreative(index, "text", e.target.value)
                            }
                            rows={4}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`driveFolderId-${index}`}>
                              Pasta Google Drive
                            </Label>
                            <Button
                              type="button"
                              variant="link"
                              className="px-0"
                              onClick={openDriveFolderManager}
                            >
                              Nova pasta
                            </Button>
                          </div>
                          <Select
                            value={creative.driveFolderId}
                            onValueChange={(value) =>
                              updateCreative(index, "driveFolderId", value)
                            }
                          >
                            <SelectTrigger
                              id={`driveFolderId-${index}`}
                              data-testid={`select-drive-folder-${index}`}
                            >
                              <SelectValue placeholder="Selecione a pasta" />
                            </SelectTrigger>
                            <SelectContent>
                              {driveFolders.map((folder) => (
                                <SelectItem
                                  key={folder.id}
                                  value={folder.value}
                                >
                                  {folder.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="existing_post" className="space-y-4">
                  {!selectedPageValue ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Selecione uma pagina no passo 1 para carregar os posts
                      existentes.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div>
                          Posts da pagina
                          <span className="font-semibold">
                            {selectedPageResource?.name ?? selectedPageValue}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetchPagePosts()}
                            disabled={isLoadingPagePosts}
                          >
                            {isLoadingPagePosts
                              ? "Atualizando..."
                              : "Atualizar"}
                          </Button>
                          {selectedPageValue && (
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={`https://www.facebook.com/${selectedPageValue}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir pagina
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>

                      {isLoadingPagePosts ? (
                        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                          Carregando posts publicados...
                        </div>
                      ) : isPagePostsError ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                          {postsErrorMessage}
                        </div>
                      ) : pagePosts.length === 0 ? (
                        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                          Nenhum post encontrado para esta pagina.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="min-w-full divide-y text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="px-3 py-2 font-medium">
                                  Post ID
                                </th>
                                <th className="px-3 py-2 font-medium">
                                  Mensagem
                                </th>
                                <th className="px-3 py-2 font-medium">
                                  Criado em
                                </th>
                                <th className="px-3 py-2 font-medium">Likes</th>
                                <th className="px-3 py-2 font-medium">
                                  Comentarios
                                </th>
                                <th className="px-3 py-2 font-medium">
                                  Compart.
                                </th>
                                <th className="px-3 py-2 font-medium">
                                  Permalink
                                </th>
                                <th className="px-3 py-2 font-medium text-right">
                                  Acao
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pagePosts.map((post) => {
                                const isSelected = selectedPost?.id === post.id;
                                return (
                                  <tr
                                    key={post.id}
                                    className={`border-b ${
                                      isSelected ? "bg-primary/5" : ""
                                    }`}
                                  >
                                    <td className="px-3 py-2 align-top text-xs font-mono">
                                      {post.id}
                                    </td>
                                    <td className="px-3 py-2 align-top text-sm text-muted-foreground">
                                      <div className="line-clamp-2">
                                        {truncateMessage(post.message, 90)}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs">
                                      {formatPostDate(post.created_time)}
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs">
                                      {post.likes}
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs">
                                      {post.comments}
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs">
                                      {post.shares}
                                    </td>
                                    <td className="px-3 py-2 align-top text-xs">
                                      {post.permalink_url ? (
                                        <Button
                                          asChild
                                          variant="link"
                                          size="sm"
                                          className="px-0 text-xs"
                                        >
                                          <a
                                            href={post.permalink_url}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Abrir
                                          </a>
                                        </Button>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="px-3 py-2 align-top text-right">
                                      <Button
                                        variant={
                                          isSelected ? "default" : "outline"
                                        }
                                        size="sm"
                                        onClick={() => setSelectedPost(post)}
                                      >
                                        {isSelected
                                          ? "Selecionado"
                                          : "Selecionar"}
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {selectedPost && selectedObjectStoryPreview && (
                        <div
                          className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2"
                          data-testid="existing-post-preview"
                        >
                          <div className="text-sm font-semibold">
                            Preview do post selecionado
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {selectedPost.message || "Post sem texto"}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>
                              Criado:{" "}
                              {formatPostDate(selectedPost.created_time)}
                            </span>
                            <span>Likes: {selectedPost.likes}</span>
                            <span>Comentarios: {selectedPost.comments}</span>
                            <span>Compart.: {selectedPost.shares}</span>
                          </div>
                          <div className="text-xs font-mono">
                            object_story_id: {selectedObjectStoryPreview}
                          </div>
                          {selectedPost.permalink_url && (
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="px-0"
                            >
                              <a
                                href={selectedPost.permalink_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir no Facebook
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
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
