import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type PreviewSet = {
  name: string;
  ads: string[];
};

type PreviewCampaign = {
  name: string;
  sets: PreviewSet[];
  adCount: number;
  setCount: number;
};

type PreviewParsed = {
  campaigns: PreviewCampaign[];
  extraLines: string[];
};

const CAMPAIGN_PREVIEW_COLLAPSE_THRESHOLD = 5;

function parsePreviewText(previewText: string): PreviewParsed {
  const lines = previewText.split(/\r?\n/);
  const campaigns: PreviewCampaign[] = [];
  const extraLines: string[] = [];

  let currentCampaign: PreviewCampaign | null = null;
  let currentSet: PreviewSet | null = null;

  const flushSet = () => {
    if (currentCampaign && currentSet) {
      currentCampaign.sets.push(currentSet);
    }
    currentSet = null;
  };

  const flushCampaign = () => {
    if (currentCampaign) {
      currentCampaign.setCount = currentCampaign.sets.length;
      currentCampaign.adCount = currentCampaign.sets.reduce(
        (total, set) => total + set.ads.length,
        0,
      );
      campaigns.push(currentCampaign);
    }
    currentCampaign = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("Campanha:")) {
      flushSet();
      flushCampaign();
      currentCampaign = {
        name: line.replace(/^Campanha:\s*/i, "") || "Campanha",
        sets: [],
        adCount: 0,
        setCount: 0,
      };
      continue;
    }

    if (line.startsWith("Conjunto:")) {
      flushSet();
      if (!currentCampaign) {
        extraLines.push(line);
        continue;
      }
      currentSet = {
        name: line.replace(/^Conjunto:\s*/i, "") || "Conjunto",
        ads: [],
      };
      continue;
    }

    if (line.startsWith("Anuncio:")) {
      if (!currentSet) {
        extraLines.push(line);
        continue;
      }
      const adLabel = line.replace(/^Anuncio:\s*/i, "");
      currentSet.ads.push(adLabel || "Anuncio");
      continue;
    }

    if (line.startsWith("+")) {
      if (currentSet) {
        currentSet.ads.push(line);
      } else {
        extraLines.push(line);
      }
      continue;
    }

    extraLines.push(line);
  }

  flushSet();
  flushCampaign();

  return { campaigns, extraLines };
}

type PreflightIssue = {
  code: string;
  message?: string;
  count?: number;
  examples?: string[];
};

type PreflightResponse = {
  run_id: string;
  status: "OK" | "WARN" | "ERROR";
  can_continue: boolean;
  preview_text?: string;
  warnings?: PreflightIssue[];
  errors?: PreflightIssue[];
  summary?: Record<string, unknown>;
};

const COOLDOWN_STORAGE_KEY = "campaignsCooldowns";

type CooldownCheckResponse = {
  active?: boolean;
  remaining_seconds?: number;
  cooldown_until?: string;
};

export default function ExistingCampaignForm() {
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [pageId, setPageId] = useState<string>("");
  const [instagramId, setInstagramId] = useState<string>("");
  const [whatsappId, setWhatsappId] = useState<string>("");
  const [leadFormId, setLeadFormId] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [driveFolderId, setDriveFolderId] = useState<string>("");
  const [driveFolderName, setDriveFolderName] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const [serverCooldownUntil, setServerCooldownUntil] = useState<number | null>(null);
  const [sendLocked, setSendLocked] = useState(false);
  const sendLockRef = useRef(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResponse | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingCampaignPayload, setPendingCampaignPayload] = useState<Record<string, unknown> | null>(
    null,
  );
  const [pendingCampaignId, setPendingCampaignId] = useState<number | null>(null);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [confirmPage, setConfirmPage] = useState(false);
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
  const loadCooldowns = useCallback(() => {
    const stored = window.localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!stored) {
      setCooldowns({});
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, number>;
      const now = Date.now();
      const normalized: Record<string, number> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value !== "number" || value <= now) {
          return;
        }
        const normalizedKey = key.replace(/\D+/g, "").trim();
        if (!normalizedKey) {
          return;
        }
        normalized[normalizedKey] = Math.max(normalized[normalizedKey] ?? 0, value);
      });
      setCooldowns(normalized);
      if (Object.keys(normalized).length === 0) {
        window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
    } catch {
      setCooldowns({});
    }
  }, []);
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
  const ensureDriveFolderResource = useCallback(
    async (folder: { name: string; value: string }) => {
      const value = folder?.value?.trim();
      if (!value) {
        return;
      }
      const alreadyExists = driveFolders.some((item) => item.value === value);
      if (alreadyExists) {
        return;
      }
      try {
        await apiRequest("POST", "/api/resources", {
          type: "drive_folder",
          name: folder.name?.trim() || value,
          value,
          metadata: { source: "drive_search" },
        });
        await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Nao foi possivel salvar a pasta.";
        toast({
          title: "Falha ao salvar pasta do Drive",
          description: message,
          variant: "destructive",
        });
      }
    },
    [driveFolders, toast],
  );
  const accountOptions = adAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    value: String(account.id),
    searchText: `${account.name} ${account.value}`.trim(),
  }));
  const selectedAccountResource =
    adAccounts.find((account) => String(account.id) === accountId) ?? null;
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
  const selectedInstagramResource =
    resources.find(
      (resource) => resource.type === "instagram" && String(resource.id) === instagramId,
    ) ?? null;
  const selectedWhatsappResource =
    resources.find(
      (resource) => resource.type === "whatsapp" && String(resource.id) === whatsappId,
    ) ?? null;
  const selectedLeadformResource =
    resources.find(
      (resource) => resource.type === "leadform" && String(resource.id) === leadFormId,
    ) ?? null;
  const selectedDriveFolderResource =
    driveFolders.find((folder) => folder.value === driveFolderId) ?? null;
  const driveFolderDisplayName =
    selectedDriveFolderResource?.name || driveFolderName || "";
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
  useEffect(() => {
    setExpandedCampaigns({});
    setConfirmAccount(false);
    setConfirmPage(false);
  }, [preflightResult?.run_id]);
  useEffect(() => {
    loadCooldowns();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COOLDOWN_STORAGE_KEY) {
        loadCooldowns();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadCooldowns]);
  useEffect(() => {
    const hasActiveCooldown = Object.values(cooldowns).some(
      (timestamp) => timestamp > cooldownNow,
    );
    if (!hasActiveCooldown) {
      return;
    }
    const intervalId = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [cooldowns, cooldownNow]);
  useEffect(() => {
    const now = Date.now();
    const cleaned = Object.fromEntries(
      Object.entries(cooldowns).filter(
        ([, value]) => typeof value === "number" && value > now,
      ),
    );
    if (Object.keys(cleaned).length > 0) {
      window.localStorage.setItem(
        COOLDOWN_STORAGE_KEY,
        JSON.stringify(cleaned),
      );
    } else {
      window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
    }
  }, [cooldowns]);
  useEffect(() => {
    if (!driveFolderId) {
      setDriveFolderName("");
      return;
    }
    if (selectedDriveFolderResource?.name) {
      setDriveFolderName(selectedDriveFolderResource.name);
    }
  }, [driveFolderId, selectedDriveFolderResource?.name]);

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

  const handleDriveFolderSelect = useCallback(
    (folder: { name: string; value: string }) => {
      setDriveFolderName(folder?.name ?? "");
      ensureDriveFolderResource(folder);
    },
    [ensureDriveFolderResource],
  );


  const preflightMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await apiRequest(
        "POST",
        "/api/existing-campaign/preflight",
        payload,
      );
      return (await response.json()) as PreflightResponse;
    },
    onSuccess: (data, variables) => {
      setPreflightResult(data);
      setPendingPayload(variables);
      setPreflightOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao validar",
        description: error.message || "Nao foi possivel validar a campanha",
        variant: "destructive",
      });
    },
  });

  const sendToN8nMutation = useMutation({
    mutationFn: async () => {
      if (!pendingCampaignPayload || !pendingPayload) {
        throw new Error("Dados da campanha nao encontrados.");
      }
      let campaignId = pendingCampaignId;
      if (!campaignId) {
        const createResponse = await apiRequest(
          "POST",
          "/api/campaigns",
          pendingCampaignPayload,
        );
        const createdCampaign = (await createResponse.json()) as { id: number };
        campaignId = createdCampaign.id;
        setPendingCampaignId(campaignId);
      }
      const webhookPayload = {
        ...pendingPayload,
        external_id: String(campaignId),
      };
      await apiRequest("POST", "/api/webhooks/n8n", webhookPayload);
      await apiRequest("PATCH", `/api/campaigns/${campaignId}`, {
        status: "pending",
        statusDetail: "Aguardando processamento do n8n",
      });
      return { id: campaignId };
    },
    onSuccess: async () => {
      toast({
        title: "Enviado!",
        description: "Campanha enviada para automacao com sucesso.",
      });
      setPreflightOpen(false);
      setPreflightResult(null);
      setPendingPayload(null);
      setPendingCampaignPayload(null);
      setPendingCampaignId(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setTimeout(() => {
        setLocation("/campaigns");
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar",
        description: error.message || "Nao foi possivel enviar para automacao.",
        variant: "destructive",
      });
    },
  });
  const handleSendToN8n = () => {
    if (sendLockRef.current || !pendingCampaignPayload) {
      return;
    }
    sendLockRef.current = true;
    setSendLocked(true);
    sendToN8nMutation.mutate(undefined, {
      onSettled: () => {
        sendLockRef.current = false;
        setSendLocked(false);
      },
    });
  };
  const preflightErrors = preflightResult?.errors ?? [];
  const preflightWarnings = preflightResult?.warnings ?? [];
  const previewText = preflightResult?.preview_text ?? "";
  const statusBadgeMap: Record<
    string,
    { label: string; icon?: string; className: string }
  > = {
    OK: {
      label: "OK",
      icon: "✅",
      className: "border-emerald-200 bg-emerald-100 text-emerald-800",
    },
    WARN: {
      label: "WARN",
      icon: "⚠️",
      className: "border-amber-200 bg-amber-100 text-amber-800",
    },
    ERROR: {
      label: "ERROR",
      icon: "⛔",
      className: "border-red-200 bg-red-100 text-red-800",
    },
    LOADING: {
      label: "Validando",
      className: "border-muted bg-muted text-foreground",
    },
  };
  const statusKey = preflightResult?.status ?? "LOADING";
  const statusBadge = statusBadgeMap[statusKey] ?? statusBadgeMap.LOADING;
  const objectiveLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    objectives.forEach((objective) => {
      map.set(objective.value, objective.label);
    });
    return map;
  }, [objectives]);
  const objectiveSummary =
    selectedObjectives.length > 0
      ? selectedObjectives
          .map((value) => objectiveLabelMap.get(value) ?? value)
          .join(", ")
      : "-";
  const formatResourceSummary = (resource?: Resource | null, fallback?: string) => {
    if (resource) {
      return `${resource.name} (${resource.value})`;
    }
    return fallback ?? "-";
  };
  const issueMessages: Record<string, string> = {
    DRIVE_NO_ACCESS: "Sem permissao na pasta do Drive.",
    DRIVE_EMPTY: "Pasta do Drive sem arquivos.",
    NO_COMPLETE_PAIRS: "Nenhum par FEED+STORIES completo encontrado.",
    INVALID_FILE_NAMING:
      "Arquivos com nome fora do padrao (ID_VERSAO_PRODUTO_POSICIONAMENTO).",
    FILE_EXT_UNSUPPORTED: "Arquivos com extensao nao suportada.",
    DUPLICATE_POSITIONING: "Posicionamento duplicado no mesmo par.",
    DRIVE_ORPHAN_FILES: "Arquivos sem par FEED+STORIES completo.",
    NO_CAMPAIGN_MATCH:
      "Nenhuma campanha no ad_account_id contem os tokens dos pares.",
    ADSET_END_DATE_EXPIRED: "Conjuntos com data de fim de veiculacao vencida.",
    PAGE_INSTAGRAM_MISMATCH: "Instagram nao vinculado a pagina informada.",
    PAGE_LEADFORM_MISMATCH: "Formulario nao vinculado a pagina informada.",
    META_FETCH_FAILED:
      "Falha ao consultar campanhas na Meta. Validacao de campanha incompleta.",
  };
  const formatIssue = (issue: PreflightIssue) => {
    const message = issueMessages[issue.code] ?? issue.message ?? issue.code;
    const countSuffix = typeof issue.count === "number" ? ` (${issue.count})` : "";
    return `${message}${countSuffix}`;
  };
  const normalizeAdAccountId = useCallback(
    (value: string) => value.replace(/\D+/g, "").trim(),
    [],
  );
  const formatCooldown = (remainingMs: number) => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  };
  const accountCooldownKey = useMemo(() => {
    if (!selectedAccountResource) {
      return "";
    }
    return normalizeAdAccountId(selectedAccountResource.value ?? "");
  }, [selectedAccountResource, normalizeAdAccountId]);
  const accountCooldownUntil = (() => {
    const now = cooldownNow;
    const localUntil = accountCooldownKey ? cooldowns[accountCooldownKey] : null;
    const localValid =
      typeof localUntil === "number" && localUntil > now ? localUntil : null;
    const serverValid =
      typeof serverCooldownUntil === "number" && serverCooldownUntil > now
        ? serverCooldownUntil
        : null;
    if (localValid && serverValid) {
      return Math.max(localValid, serverValid);
    }
    return localValid ?? serverValid ?? null;
  })();
  const accountCooldownRemainingMs = accountCooldownUntil
    ? Math.max(0, accountCooldownUntil - cooldownNow)
    : 0;
  useEffect(() => {
    if (!selectedAccountResource) {
      setServerCooldownUntil(null);
      return;
    }
    const adAccountId = normalizeAdAccountId(selectedAccountResource.value ?? "");
    if (!adAccountId) {
      setServerCooldownUntil(null);
      return;
    }

    let isActive = true;

    const fetchCooldown = async () => {
      try {
        const response = await apiRequest(
          "GET",
          `/api/campaigns/cooldown?ad_account_id=${encodeURIComponent(adAccountId)}`,
        );
        const data = (await response.json()) as CooldownCheckResponse;
        if (!isActive) {
          return;
        }

        if (data?.active) {
          let untilMs: number | null = null;
          if (typeof data.remaining_seconds === "number" && data.remaining_seconds > 0) {
            untilMs = Date.now() + data.remaining_seconds * 1000;
          } else if (data.cooldown_until) {
            const parsed = Date.parse(data.cooldown_until);
            if (Number.isFinite(parsed)) {
              untilMs = parsed;
            }
          }
          setServerCooldownUntil(untilMs);
          if (untilMs) {
            setCooldowns((prev) => ({ ...prev, [adAccountId]: untilMs! }));
          }
        } else {
          setServerCooldownUntil(null);
        }
      } catch {
        if (!isActive) {
          return;
        }
        setServerCooldownUntil(null);
      }
    };

    fetchCooldown();

    return () => {
      isActive = false;
    };
  }, [selectedAccountResource, normalizeAdAccountId]);
  const parsedPreview = useMemo(() => parsePreviewText(previewText), [previewText]);
  const shouldCollapsePreview =
    parsedPreview.campaigns.length > CAMPAIGN_PREVIEW_COLLAPSE_THRESHOLD;
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

    const accountResource = adAccounts.find((account) => String(account.id) === accountId);
    if (!accountResource?.value) {
      toast({
        title: "Conta invalida",
        description: "Conta de anuncios nao encontrada.",
        variant: "destructive",
      });
      return;
    }

    const pageResource = pages.find((page) => String(page.id) === pageId);
    if (!pageResource?.value) {
      toast({
        title: "Pagina invalida",
        description: "Pagina selecionada nao encontrada.",
        variant: "destructive",
      });
      return;
    }

    const instagramResource = resources.find(
      (resource) => resource.type === "instagram" && String(resource.id) === instagramId,
    );
    if (!instagramResource?.value) {
      toast({
        title: "Instagram invalido",
        description: "Instagram selecionado nao encontrado.",
        variant: "destructive",
      });
      return;
    }

    const whatsappResource = resources.find(
      (resource) => resource.type === "whatsapp" && String(resource.id) === whatsappId,
    );
    if (needsWhatsApp && !whatsappResource?.value) {
      toast({
        title: "WhatsApp invalido",
        description: "Numero WhatsApp selecionado nao encontrado.",
        variant: "destructive",
      });
      return;
    }

    const leadformResource = resources.find(
      (resource) => resource.type === "leadform" && String(resource.id) === leadFormId,
    );
    if (needsLeadForm && !leadformResource?.value) {
      toast({
        title: "Formulario invalido",
        description: "Formulario selecionado nao encontrado.",
        variant: "destructive",
      });
      return;
    }

      const payload: Record<string, unknown> = {
        ad_account_id: normalizeAdAccountId(accountResource.value),
        campaign_name: normalizedTitle,
        objective: selectedObjectives[0],
        objectives: selectedObjectives,
        page_id: pageResource.value,
      page_name: pageResource.name,
      instagram_user_id: instagramResource.value,
      instagram_name: instagramResource.name,
      whatsapp_number_id: whatsappResource?.value ?? "",
      whatsapp_name: whatsappResource?.name ?? "",
      lead_form_id: leadformResource?.value ?? "",
      lead_form_name: leadformResource?.name ?? "",
      leadgen_form_id: leadformResource?.value ?? "",
      leadgen_form_name: leadformResource?.name ?? "",
      drive_folder_id: driveFolderId,
      title_text: normalizedTitle,
      message_text: normalizedMessage,
      website_url: websiteUrl || "",
    };

    const campaignPayload: Record<string, unknown> = {
      name: normalizedTitle,
      objective: selectedObjectives[0],
      accountId: accountId ? Number(accountId) : undefined,
      pageId: pageId ? Number(pageId) : undefined,
      instagramId: instagramId ? Number(instagramId) : undefined,
      whatsappId: whatsappId ? Number(whatsappId) : undefined,
      leadformId:
        needsLeadForm && leadformResource ? Number(leadformResource.id) : undefined,
        websiteUrl: websiteUrl || undefined,
        driveFolderId: driveFolderId || undefined,
        title: normalizedTitle || undefined,
        message: normalizedMessage || undefined,
        adSets: [],
        creatives: [
          {
            title: normalizedTitle,
            text: normalizedMessage,
            driveFolderId: driveFolderId,
            driveFolderName: driveFolderDisplayName || undefined,
          },
        ],
    };

    setPreflightResult(null);
    setPendingPayload(payload);
    setPendingCampaignPayload(campaignPayload);
    setPendingCampaignId(null);
    preflightMutation.mutate(payload);
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
                {accountCooldownRemainingMs > 0 && (
                  <p className="text-sm text-amber-600">
                    Conta em cooldown. Aguarde {formatCooldown(accountCooldownRemainingMs)} para reenviar.
                  </p>
                )}
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
                  onSelectOption={handleDriveFolderSelect}
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
            disabled={preflightMutation.isPending}
            data-testid="button-submit"
          >
            {preflightMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              "Validar e enviar"
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

      <Dialog open={preflightOpen} onOpenChange={setPreflightOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto p-0">
          <DialogHeader className="sticky top-0 z-20 border-b bg-background px-6 pt-6 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle>Validar campanha</DialogTitle>
                <DialogDescription>
                  Revise e aprove para iniciar a automacao.
                </DialogDescription>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${statusBadge.className}`}
              >
                {statusBadge.icon ? <span aria-hidden>{statusBadge.icon}</span> : null}
                {statusBadge.label}
              </span>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 pt-4 pb-6">
            {!preflightResult ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparando validacao...
              </div>
            ) : (
              <>
                <div className="rounded-md border p-4">
                  <div className="text-sm font-semibold">Dados do formulario</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Conta Meta Ads:</span>
                      <p className="font-medium">
                        {formatResourceSummary(selectedAccountResource, accountId || "-")}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Objetivos:</span>
                      <p className="font-medium">{objectiveSummary}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pagina:</span>
                      <p className="font-medium">
                        {formatResourceSummary(selectedPageResource ?? null, pageId || "-")}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Instagram:</span>
                      <p className="font-medium">
                        {formatResourceSummary(selectedInstagramResource, instagramId || "-")}
                      </p>
                    </div>
                    {needsWhatsApp && (
                      <div>
                        <span className="text-muted-foreground">WhatsApp:</span>
                        <p className="font-medium">
                          {formatResourceSummary(selectedWhatsappResource, whatsappId || "-")}
                        </p>
                      </div>
                    )}
                    {needsLeadForm && (
                      <div>
                        <span className="text-muted-foreground">Formulario:</span>
                        <p className="font-medium">
                          {formatResourceSummary(selectedLeadformResource, leadFormId || "-")}
                        </p>
                      </div>
                    )}
                    {needsWebsite && (
                      <div>
                        <span className="text-muted-foreground">Website:</span>
                        <p className="font-medium">{websiteUrl || "-"}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Pasta Drive:</span>
                      <p className="font-medium">
                        {selectedDriveFolderResource
                          ? formatResourceSummary(selectedDriveFolderResource, driveFolderId || "-")
                          : driveFolderDisplayName || driveFolderId || "-"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Titulo:</span>
                      <p className="font-medium">{title || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Mensagem:</span>
                      <p className="font-medium whitespace-pre-wrap">{message || "-"}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-4">
                  <div className="text-sm font-semibold">Confirmacao obrigatoria</div>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-account"
                        checked={confirmAccount}
                        onCheckedChange={(value) => setConfirmAccount(Boolean(value))}
                      />
                      <Label htmlFor="confirm-account" className="leading-relaxed">
                        Confirmo a conta de anuncios:{" "}
                        <span className="font-medium">
                          {formatResourceSummary(selectedAccountResource, accountId || "-")}
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-page"
                        checked={confirmPage}
                        onCheckedChange={(value) => setConfirmPage(Boolean(value))}
                      />
                      <Label htmlFor="confirm-page" className="leading-relaxed">
                        Confirmo a pagina:{" "}
                        <span className="font-medium">
                          {formatResourceSummary(selectedPageResource ?? null, pageId || "-")}
                        </span>
                      </Label>
                    </div>
                    {(!confirmAccount || !confirmPage) && (
                      <div className="text-xs text-muted-foreground">
                        Marque as duas confirmacoes para liberar o envio.
                      </div>
                    )}
                  </div>
                </div>

                {preflightErrors.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
                    <div className="font-semibold text-destructive">Erros</div>
                    <ul className="mt-2 space-y-2 text-sm text-destructive">
                      {preflightErrors.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          <span className="font-medium">{formatIssue(issue)}</span>
                          {issue.examples && issue.examples.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Ex: {issue.examples.join(", ")}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preflightWarnings.length > 0 && (
                  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-4">
                    <div className="font-semibold text-yellow-700">Avisos</div>
                    <ul className="mt-2 space-y-2 text-sm text-yellow-700">
                      {preflightWarnings.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          <span className="font-medium">{formatIssue(issue)}</span>
                          {issue.examples && issue.examples.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Ex: {issue.examples.join(", ")}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                  <div className="rounded-md border p-4">
                    <div className="text-sm font-semibold">Preview</div>
                  {previewText ? (
                    <div className="mt-2 space-y-4">
                      {parsedPreview.extraLines.length > 0 && (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {parsedPreview.extraLines.join("\n")}
                        </div>
                      )}
                      {parsedPreview.campaigns.length === 0 ? (
                        parsedPreview.extraLines.length === 0 ? (
                          <div className="text-sm text-muted-foreground">
                            Nenhuma campanha encontrada.
                          </div>
                        ) : null
                      ) : (
                        <div className="space-y-6">
                          {parsedPreview.campaigns.map((campaign, index) => {
                            const campaignKey = `${campaign.name}-${index}`;
                            const isExpanded =
                              expandedCampaigns[campaignKey] ?? !shouldCollapsePreview;
                            return (
                              <div key={campaignKey} className="rounded-md border p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <div className="text-sm font-semibold">
                                      {campaign.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Conjuntos: {campaign.setCount} | Anuncios: {campaign.adCount}
                                    </div>
                                  </div>
                                  {shouldCollapsePreview && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setExpandedCampaigns((prev) => ({
                                          ...prev,
                                          [campaignKey]: !isExpanded,
                                        }))
                                      }
                                    >
                                      {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                                    </Button>
                                  )}
                                </div>
                                {isExpanded && (
                                  <div className="mt-4 space-y-4">
                                    {campaign.sets.map((set, setIndex) => (
                                      <div key={`${campaignKey}-set-${setIndex}`} className="space-y-2">
                                        <div className="text-sm font-medium">{set.name}</div>
                                        {set.ads.length > 0 ? (
                                          <ul className="list-disc pl-5 text-sm">
                                            {set.ads.map((ad, adIndex) => (
                                              <li key={`${campaignKey}-ad-${adIndex}`}>
                                                {ad}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <div className="text-sm text-muted-foreground">
                                            Nenhum anuncio listado.
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Nenhum preview disponivel.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

            <DialogFooter className="px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreflightOpen(false)}
              >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleSendToN8n}
              disabled={
                !pendingCampaignPayload ||
                !pendingPayload ||
                sendToN8nMutation.isPending ||
                sendLocked ||
                !preflightResult?.can_continue ||
                !confirmAccount ||
                !confirmPage
              }
            >
              {sendToN8nMutation.isPending || sendLocked ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
