import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import {
  format as formatDate,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import {
  BarChart3,
  DollarSign,
  MessageSquareText,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import type { Campaign, Resource } from "@shared/schema";
import {
  apiRequest,
  queryClient,
} from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type {
  ActiveFilterChip,
  CurrentUser,
  DashboardAccountMetrics,
  DashboardCampaignIndexEntry,
  DashboardCampaignMetrics,
  DashboardKpi,
  DashboardLeadsByAccountDatum,
  DashboardMetricsResponse,
  DashboardProps,
  DashboardQuickRange,
  DashboardShareMetadataResponse,
  DashboardSpendByAccountDatum,
  DashboardTimelinePoint,
  DashboardTopCreativesResponse,
  FilterOption,
} from "../types";
import {
  EMPTY_TOTALS,
  buildCampaignHeaderSnapshot,
  calcTrend,
  formatCurrency,
  formatInteger,
  getCPM,
  getCostPerLead,
  getObjectiveLabel,
  getStatusLabel,
  labelFromRange,
  normalizeRange,
  sameRange,
  STATUS_LABELS,
} from "../utils";

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

export function useDashboardController({
  shareToken = null,
  readOnly = false,
  autoPrint = false,
  reportMode = false,
}: DashboardProps = {}) {
  const isSharedMode = readOnly && !!shareToken;
  const defaultRange = useMemo(() => normalizeRange(null), []);
  const [rawRange, setRawRange] = useState<DateRange | null>(defaultRange);
  const normalizedRange = useMemo(() => normalizeRange(rawRange), [rawRange]);
  const [appliedRange, setAppliedRange] = useState<DateRange>(defaultRange);

  const appliedFrom = appliedRange.from!;
  const appliedTo = appliedRange.to!;
  const startDateStr = formatDate(appliedFrom, "yyyy-MM-dd");
  const endDateStr = formatDate(appliedTo, "yyyy-MM-dd");

  const [didAutoPrint, setDidAutoPrint] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [appliedAccountIds, setAppliedAccountIds] = useState<string[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [appliedCampaignFilter, setAppliedCampaignFilter] = useState<string | null>(null);
  const [campaignNameSearch, setCampaignNameSearch] = useState("");
  const [appliedCampaignNameSearch, setAppliedCampaignNameSearch] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState<string | null>(null);
  const [appliedObjectiveFilter, setAppliedObjectiveFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"macro" | "campaigns">("macro");
  const [creativeDialogInfo, setCreativeDialogInfo] = useState<{
    campaign: DashboardCampaignMetrics;
    account: string;
    header: ReturnType<typeof buildCampaignHeaderSnapshot>;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [printAssetsReady, setPrintAssetsReady] = useState(false);
  const [isGoalsDialogOpen, setIsGoalsDialogOpen] = useState(false);

  const shareMetadataEndpoint = shareToken
    ? `/api/public/dashboard/share/metadata?token=${encodeURIComponent(shareToken)}`
    : null;

  const { data: shareMetadata, isLoading: isShareMetadataLoading } =
    useQuery<DashboardShareMetadataResponse, Error>({
      queryKey: shareMetadataEndpoint ? [shareMetadataEndpoint] : ["dashboard-share-disabled"],
      queryFn: async () => {
        if (!shareMetadataEndpoint) {
          throw new Error("Link compartilhado inválido.");
        }
        const res = await fetch(shareMetadataEndpoint);
        if (!res.ok) {
          throw new Error("Nao foi possivel carregar o link compartilhado.");
        }
        return res.json();
      },
      enabled: isSharedMode && !!shareMetadataEndpoint,
    });

  const effectiveStartDateStr = isSharedMode
    ? shareMetadata?.dateRange.start ?? startDateStr
    : startDateStr;
  const effectiveEndDateStr = isSharedMode
    ? shareMetadata?.dateRange.end ?? endDateStr
    : endDateStr;
  const periodLabel = isSharedMode
    ? shareMetadata
      ? labelFromRange({
          from: parseISO(shareMetadata.dateRange.start),
          to: parseISO(shareMetadata.dateRange.end),
        })
      : "Carregando período"
    : labelFromRange(appliedRange);

  const { data: me } = useQuery<CurrentUser>({
    queryKey: ["/api/me"],
    enabled: !isSharedMode,
  });

  const isSystemAdmin = useMemo(() => {
    if (!me) return false;
    if (me.role === "system_admin") return true;
    return Array.isArray(me.roles) && me.roles.includes("system_admin");
  }, [me]);

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
    enabled: !isSharedMode,
  });
  const { data: campaignsCatalog = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
    enabled: !isSharedMode,
  });

  const accountResources = useMemo(
    () => resources.filter((resource) => resource.type === "account"),
    [resources],
  );

  const accountLookup = useMemo(() => {
    const map = new Map<number, { name: string; value: string }>();
    for (const account of accountResources) {
      map.set(account.id, { name: account.name, value: account.value });
    }
    return map;
  }, [accountResources]);

  const accountOptions: FilterOption[] = useMemo(
    () =>
      accountResources
        .map((account) => ({
          value: String(account.id),
          label: account.name,
          description: account.value,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [accountResources],
  );

  const sharedAccountIds = useMemo(
    () => shareMetadata?.accounts.map((account) => String(account.id)) ?? [],
    [shareMetadata],
  );
  const effectiveAccountIds = isSharedMode ? sharedAccountIds : appliedAccountIds;
  const effectiveCampaignFilter = isSharedMode
    ? shareMetadata?.filters.campaignId ?? null
    : appliedCampaignFilter;
  const effectiveCampaignNameSearch = isSharedMode ? "" : appliedCampaignNameSearch.trim();
  const effectiveObjectiveFilter = isSharedMode
    ? shareMetadata?.filters.objective ?? null
    : appliedObjectiveFilter;
  const effectiveStatusFilter = isSharedMode
    ? shareMetadata?.filters.status ?? null
    : appliedStatusFilter;
  const sortedEffectiveAccountIds = useMemo(
    () => [...effectiveAccountIds].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [effectiveAccountIds],
  );
  const hasSelectedAccounts = isSharedMode
    ? sharedAccountIds.length > 0
    : appliedAccountIds.length > 0;

  const params = new URLSearchParams({
    startDate: effectiveStartDateStr,
    endDate: effectiveEndDateStr,
  });
  if (sortedEffectiveAccountIds.length > 0) {
    params.set("accountId", sortedEffectiveAccountIds.join(","));
  }
  if (effectiveCampaignFilter) params.set("campaignId", effectiveCampaignFilter);
  if (effectiveCampaignNameSearch) params.set("campaignSearch", effectiveCampaignNameSearch);
  if (effectiveObjectiveFilter) params.set("objective", effectiveObjectiveFilter);
  if (effectiveStatusFilter) params.set("status", effectiveStatusFilter);

  const metricsEndpoint =
    isSharedMode && shareToken
      ? `/api/public/dashboard/metrics?token=${encodeURIComponent(shareToken)}`
      : `/api/dashboard/metrics?${params.toString()}`;

  const metricsQuery = useQuery<DashboardMetricsResponse, Error>({
    queryKey: [metricsEndpoint],
    queryFn: async () => {
      const res = await fetch(metricsEndpoint);
      if (!res.ok) throw new Error("Erro ao carregar métricas.");
      return res.json();
    },
    enabled: hasSelectedAccounts,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const topCreativesEndpoint =
    isSharedMode && shareToken
      ? `/api/public/dashboard/top-creatives?token=${encodeURIComponent(shareToken)}`
      : `/api/dashboard/top-creatives?${params.toString()}`;

  const topCreativesQuery = useQuery<DashboardTopCreativesResponse, Error>({
    queryKey: [topCreativesEndpoint],
    queryFn: async () => {
      const res = await fetch(topCreativesEndpoint);
      if (!res.ok) {
        throw new Error("Erro ao carregar top criativos.");
      }
      return res.json();
    },
    enabled: hasSelectedAccounts,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const accounts: DashboardAccountMetrics[] = metricsQuery.data?.accounts ?? [];
  const topCreativesByAccount = topCreativesQuery.data?.accounts ?? [];
  const isPrintReady =
    isSharedMode &&
    !isShareMetadataLoading &&
    !!metricsQuery.data &&
    !topCreativesQuery.isLoading &&
    !topCreativesQuery.isFetching &&
    printAssetsReady;
  const loadingSteps = useMemo(() => {
    const steps = [
      {
        label: "Metricas",
        enabled: hasSelectedAccounts,
        complete:
          hasSelectedAccounts &&
          !metricsQuery.isLoading &&
          !metricsQuery.isFetching &&
          !metricsQuery.isRefetching,
      },
      {
        label: "Criativos",
        enabled: hasSelectedAccounts,
        complete:
          hasSelectedAccounts &&
          !topCreativesQuery.isLoading &&
          !topCreativesQuery.isFetching &&
          !topCreativesQuery.isRefetching,
      },
    ];

    if (isSharedMode) {
      steps.unshift({
        label: "Contexto compartilhado",
        enabled: true,
        complete: !isShareMetadataLoading,
      });
    }

    return steps;
  }, [
    hasSelectedAccounts,
    isShareMetadataLoading,
    isSharedMode,
    metricsQuery.isFetching,
    metricsQuery.isLoading,
    metricsQuery.isRefetching,
    topCreativesQuery.isFetching,
    topCreativesQuery.isLoading,
    topCreativesQuery.isRefetching,
  ]);
  const loadingProgress = useMemo(() => {
    const activeSteps = loadingSteps.filter((step) => step.enabled);
    if (activeSteps.length === 0) {
      return 0;
    }

    const completedSteps = activeSteps.filter((step) => step.complete).length;
    return Math.round((completedSteps / activeSteps.length) * 100);
  }, [loadingSteps]);
  const loadingStatusLabel = useMemo(() => {
    const pendingStep = loadingSteps.find((step) => step.enabled && !step.complete);
    if (!pendingStep) {
      return "Concluindo carregamento";
    }

    return `Carregando ${pendingStep.label.toLocaleLowerCase("pt-BR")}`;
  }, [loadingSteps]);

  const campaignIndex = useMemo(() => {
    const map = new Map<string, DashboardCampaignIndexEntry>();
    for (const account of accounts) {
      for (const campaign of account.campaigns) {
        map.set(`${account.value}:${campaign.id}`, {
          campaign,
          accountValue: account.value,
        });
      }
    }
    return map;
  }, [accounts]);

  const campaignOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const options: FilterOption[] = [];
    const filterAccSet = selectedAccountIds.length > 0 ? new Set(selectedAccountIds) : null;

    for (const account of accounts) {
      if (filterAccSet && !filterAccSet.has(String(account.id))) continue;
      for (const campaign of account.campaigns) {
        if (!campaign.id || seen.has(campaign.id)) continue;
        seen.add(campaign.id);
        options.push({
          value: campaign.id,
          label: campaign.name ?? `Campanha ${campaign.id}`,
          description: [getObjectiveLabel(campaign.objective), account.name]
            .filter(Boolean)
            .join(" - "),
        });
      }
    }

    if (options.length === 0 && campaignsCatalog.length > 0) {
      for (const campaign of campaignsCatalog) {
        const accId = campaign.accountId ?? null;
        if (filterAccSet && (!accId || !filterAccSet.has(String(accId)))) {
          continue;
        }
        const lookup = accId ? accountLookup.get(accId) : undefined;
        const idStr = String(campaign.id);
        if (seen.has(idStr)) continue;
        seen.add(idStr);
        options.push({
          value: idStr,
          label: campaign.name ?? `Campanha ${campaign.id}`,
          description: [getObjectiveLabel(campaign.objective), lookup?.name]
            .filter(Boolean)
            .join(" - "),
        });
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accountLookup, accounts, campaignsCatalog, selectedAccountIds]);

  useEffect(() => {
    if (campaignFilter && !campaignOptions.some((option) => option.value === campaignFilter)) {
      setCampaignFilter(null);
    }
  }, [campaignFilter, campaignOptions]);

  const objectiveOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const options: FilterOption[] = [];

    const add = (raw?: string | null) => {
      if (!raw) return;
      const key = raw.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({
        value: key,
        label: getObjectiveLabel(key),
      });
    };

    for (const account of accounts) {
      if (
        selectedAccountIds.length > 0 &&
        !selectedAccountIds.includes(String(account.id))
      ) {
        continue;
      }
      for (const campaign of account.campaigns) {
        add(campaign.objective);
      }
    }

    if (options.length === 0 && campaignsCatalog.length > 0) {
      for (const campaign of campaignsCatalog) {
        if (
          selectedAccountIds.length > 0 &&
          (!campaign.accountId || !selectedAccountIds.includes(String(campaign.accountId)))
        ) {
          continue;
        }
        add(campaign.objective ?? null);
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accounts, campaignsCatalog, selectedAccountIds]);

  useEffect(() => {
    if (
      objectiveFilter &&
      !objectiveOptions.some((option) => option.value === objectiveFilter)
    ) {
      setObjectiveFilter(null);
    }
  }, [objectiveFilter, objectiveOptions]);

  const statusOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const options: FilterOption[] = [];

    for (const account of accounts) {
      for (const campaign of account.campaigns) {
        const raw = campaign.status ?? "";
        if (!raw) continue;
        const upper = raw.toUpperCase();
        if (seen.has(upper)) continue;
        seen.add(upper);
        options.push({
          value: upper,
          label: getStatusLabel(upper),
        });
      }
    }

    if (options.length === 0) {
      Object.keys(STATUS_LABELS).forEach((statusKey) => {
        options.push({
          value: statusKey,
          label: getStatusLabel(statusKey),
        });
      });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accounts]);

  useEffect(() => {
    if (statusFilter && !statusOptions.some((option) => option.value === statusFilter)) {
      setStatusFilter(null);
    }
  }, [statusFilter, statusOptions]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    appliedAccountIds.forEach((accountId) => {
      const option = accountOptions.find((entry) => entry.value === accountId);
      chips.push({
        label: "Conta",
        value: option?.label ?? `ID ${accountId}`,
        onRemove: () => {
          setSelectedAccountIds((previous) => previous.filter((entry) => entry !== accountId));
          setAppliedAccountIds((previous) => previous.filter((entry) => entry !== accountId));
        },
      });
    });

    if (appliedCampaignFilter) {
      const option = campaignOptions.find((entry) => entry.value === appliedCampaignFilter);
      chips.push({
        label: "Campanha",
        value: option?.label ?? `ID ${appliedCampaignFilter}`,
        onRemove: () => {
          setCampaignFilter(null);
          setAppliedCampaignFilter(null);
        },
      });
    }

    if (appliedCampaignNameSearch) {
      chips.push({
        label: "Nome",
        value: appliedCampaignNameSearch,
        onRemove: () => {
          setCampaignNameSearch("");
          setAppliedCampaignNameSearch("");
        },
      });
    }

    if (appliedObjectiveFilter) {
      const option = objectiveOptions.find((entry) => entry.value === appliedObjectiveFilter);
      chips.push({
        label: "Objetivo",
        value: option?.label ?? getObjectiveLabel(appliedObjectiveFilter),
        onRemove: () => {
          setObjectiveFilter(null);
          setAppliedObjectiveFilter(null);
        },
      });
    }

    if (appliedStatusFilter) {
      const option = statusOptions.find((entry) => entry.value === appliedStatusFilter);
      chips.push({
        label: "Status",
        value: option?.label ?? getStatusLabel(appliedStatusFilter),
        onRemove: () => {
          setStatusFilter(null);
          setAppliedStatusFilter(null);
        },
      });
    }

    return chips;
  }, [
    accountOptions,
    appliedAccountIds,
    appliedCampaignFilter,
    appliedCampaignNameSearch,
    campaignOptions,
    appliedObjectiveFilter,
    objectiveOptions,
    appliedStatusFilter,
    statusOptions,
  ]);

  const hasActiveFilters =
    appliedAccountIds.length > 0 ||
    !!appliedCampaignFilter ||
    !!appliedCampaignNameSearch ||
    !!appliedObjectiveFilter ||
    !!appliedStatusFilter;

  const hasPendingChanges = isSharedMode
    ? false
    : !sameRange(normalizedRange, appliedRange) ||
      !sameStringArray(selectedAccountIds, appliedAccountIds) ||
      campaignFilter !== appliedCampaignFilter ||
      campaignNameSearch.trim() !== appliedCampaignNameSearch ||
      objectiveFilter !== appliedObjectiveFilter ||
      statusFilter !== appliedStatusFilter;

  const applyFilters = () => {
    const nextAccounts = [...selectedAccountIds].sort((a, b) => a.localeCompare(b, "pt-BR"));
    setSelectedAccountIds(nextAccounts);
    setAppliedRange(normalizedRange);
    setAppliedAccountIds(nextAccounts);
    setAppliedCampaignFilter(campaignFilter);
    setAppliedCampaignNameSearch(campaignNameSearch.trim());
    setAppliedObjectiveFilter(objectiveFilter);
    setAppliedStatusFilter(statusFilter);
    setCreativeDialogInfo(null);
  };

  const clearAllFilters = () => {
    setSelectedAccountIds([]);
    setAppliedAccountIds([]);
    setCampaignFilter(null);
    setAppliedCampaignFilter(null);
    setCampaignNameSearch("");
    setAppliedCampaignNameSearch("");
    setObjectiveFilter(null);
    setAppliedObjectiveFilter(null);
    setStatusFilter(null);
    setAppliedStatusFilter(null);
    setCreativeDialogInfo(null);
  };

  const kpis = useMemo<DashboardKpi[]>(() => {
    const totals = metricsQuery.data?.totals ?? EMPTY_TOTALS;
    const previous = metricsQuery.data?.previousTotals ?? EMPTY_TOTALS;
    const cpmNow = getCPM(totals.spend, totals.impressions);
    const cpmPrev = getCPM(previous.spend, previous.impressions);
    const cplNow = getCostPerLead(totals.spend, totals.leads);
    const cplPrev = getCostPerLead(previous.spend, previous.leads);

    return [
      {
        title: "Total Gasto",
        value: formatCurrency(totals.spend),
        icon: DollarSign,
        trend: calcTrend(totals.spend, previous.spend),
      },
      {
        title: "CPM",
        value: cpmNow !== null ? formatCurrency(cpmNow) : "—",
        icon: BarChart3,
        trend: calcTrend(cpmNow, cpmPrev, true),
      },
      {
        title: "Contas Alcançadas",
        value: formatInteger(totals.reach),
        icon: Users,
        trend: calcTrend(totals.reach, previous.reach),
      },
      {
        title: "Leads",
        value: formatInteger(totals.leads),
        icon: Target,
        trend: calcTrend(totals.leads, previous.leads),
      },
      {
        title: "Custo por Lead",
        value: cplNow !== null ? formatCurrency(cplNow) : "—",
        icon: TrendingUp,
        trend: calcTrend(cplNow, cplPrev, true),
      },
      {
        title: "Conversas Iniciadas",
        value: formatInteger(totals.messagingConversationsStarted),
        icon: MessageSquareText,
        trend: calcTrend(
          totals.messagingConversationsStarted,
          previous.messagingConversationsStarted,
        ),
      },
    ];
  }, [metricsQuery.data]);

  const timelineData = useMemo<DashboardTimelinePoint[]>(
    () =>
      (metricsQuery.data?.timeline ?? []).map((point) => ({
        ...point,
        label: formatDate(parseISO(point.date), "dd/MM"),
      })),
    [metricsQuery.data],
  );

  const leadsByAccountData = useMemo<DashboardLeadsByAccountDatum[]>(
    () => {
      const totalLeads = accounts.reduce((sum, account) => sum + account.metrics.leads, 0);
      return accounts.map((account) => ({
        name: account.name,
        shortName: account.name.length > 18 ? `${account.name.slice(0, 18)}...` : account.name,
        leads: account.metrics.leads,
        previousLeads: account.previousMetrics?.leads ?? 0,
        spend: account.metrics.spend,
        previousSpend: account.previousMetrics?.spend ?? 0,
        costPerLead: getCostPerLead(account.metrics.spend, account.metrics.leads),
        previousCostPerLead: getCostPerLead(
          account.previousMetrics?.spend ?? 0,
          account.previousMetrics?.leads ?? 0,
        ),
        percentage: totalLeads > 0 ? (account.metrics.leads / totalLeads) * 100 : 0,
      }));
    },
    [accounts],
  );

  const spendByAccountData = useMemo<DashboardSpendByAccountDatum[]>(() => {
    const totalSpend = accounts.reduce((sum, account) => sum + account.metrics.spend, 0);
    return accounts
      .filter((account) => account.metrics.spend > 0)
      .map((account, index) => ({
        name: account.name,
        value: account.metrics.spend,
        percentage: totalSpend > 0 ? (account.metrics.spend / totalSpend) * 100 : 0,
        fill: ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#dc2626", "#0891b2"][index % 6],
      }))
      .sort((a, b) => b.value - a.value);
  }, [accounts]);

  const funnelSteps = useMemo(() => {
    const reach = metricsQuery.data?.totals.reach ?? 0;
    const clicks = metricsQuery.data?.totals.clicks ?? 0;
    const leads = metricsQuery.data?.totals.leads ?? 0;
    const base = Math.max(reach, 1);

    return [
      {
        order: 1,
        label: "Alcance",
        value: reach,
        fill: "border-slate-300 bg-slate-400/90",
        width: "100%",
      },
      {
        order: 2,
        label: "Cliques",
        value: clicks,
        fill: "border-blue-300 bg-blue-500/90",
        width: `${Math.max((clicks / base) * 100, clicks > 0 ? 68 : 40)}%`,
      },
      {
        order: 3,
        label: "Leads",
        value: leads,
        fill: "border-emerald-300 bg-emerald-500/90",
        width: `${Math.max((leads / base) * 100, leads > 0 ? 42 : 24)}%`,
      },
    ];
  }, [metricsQuery.data]);

  const quickRanges = useMemo<DashboardQuickRange[]>(() => {
    const now = new Date();
    return [
      { label: "Últimos 7 dias", range: { from: subDays(now, 6), to: now } },
      { label: "Últimos 30 dias", range: { from: subDays(now, 29), to: now } },
      { label: "Este mês", range: { from: startOfMonth(now), to: now } },
    ];
  }, []);

  const applyQuickRange = (range: DateRange) => {
    setRawRange(normalizeRange(range));
  };

  useEffect(() => {
    if (!isSharedMode || !autoPrint || reportMode || didAutoPrint || !isPrintReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.print();
      setDidAutoPrint(true);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [autoPrint, didAutoPrint, isPrintReady, isSharedMode, reportMode]);

  useEffect(() => {
    if (!isSharedMode || !autoPrint) {
      setPrintAssetsReady(false);
      return;
    }

    let cancelled = false;

    const verifyAssets = async () => {
      if (typeof document === "undefined") return;

      if ("fonts" in document && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // ignore font readiness errors
        }
      }

      const images = Array.from(document.images);
      const pendingImages = images.filter((image) => !image.complete);

      if (pendingImages.length === 0) {
        if (!cancelled) setPrintAssetsReady(true);
        return;
      }

      await Promise.all(
        pendingImages.map(
          (image) =>
            new Promise<void>((resolve) => {
              const done = () => resolve();
              image.addEventListener("load", done, { once: true });
              image.addEventListener("error", done, { once: true });
            }),
        ),
      );

      if (!cancelled) {
        setPrintAssetsReady(true);
      }
    };

    setPrintAssetsReady(false);
    verifyAssets();

    return () => {
      cancelled = true;
    };
  }, [autoPrint, isSharedMode, metricsQuery.data, topCreativesByAccount]);

  useEffect(() => {
    if (!isSharedMode) return;
    document.title = `relatorio-dashboard-${effectiveStartDateStr}-${effectiveEndDateStr}`;
  }, [effectiveEndDateStr, effectiveStartDateStr, isSharedMode]);

  const handleAccountsChange = (values: string[]) => {
    setSelectedAccountIds(values);
    setCampaignFilter(null);
    setCreativeDialogInfo(null);
  };

  const openCampaignCreatives = (
    campaign: DashboardCampaignMetrics,
    accountValue: string,
  ) => {
    if (isSharedMode) return;
    setCreativeDialogInfo({
      campaign,
      account: accountValue,
      header: buildCampaignHeaderSnapshot(campaign),
    });
  };

  const goalsButtonLabel = useMemo(() => {
    if (accounts.length === 0) return "Cadastrar metas";
    const goalsCount = accounts.filter((account) => account.goal).length;
    if (goalsCount === 0) return "Cadastrar metas";
    if (goalsCount === accounts.length) return "Editar metas";
    return "Completar metas";
  }, [accounts]);

  const saveGoalsMutation = useMutation({
    mutationFn: async (
      goals: Array<{
        accountId: number;
        accountName: string;
        targetSpend: number;
        targetLeads: number;
      }>,
    ) => {
      const response = await apiRequest("POST", "/api/dashboard/goals", {
        startDate: effectiveStartDateStr,
        endDate: effectiveEndDateStr,
        goals,
      });
      return response.json();
    },
    onSuccess: async () => {
      setIsGoalsDialogOpen(false);
      await metricsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: [metricsEndpoint] });
      toast({
        title: "Metas salvas",
        description: "As metas do periodo foram atualizadas com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Falha ao salvar metas",
        description: error instanceof Error ? error.message : "Nao foi possivel salvar as metas.",
      });
    },
  });

  return {
    isSharedMode,
    startDateStr,
    endDateStr,
    effectiveStartDateStr,
    effectiveEndDateStr,
    periodLabel,
    shareMetadata,
    isShareMetadataLoading,
    isSystemAdmin,
    normalizedRange,
    setRawRange,
    selectedAccountIds,
    campaignFilter,
    campaignNameSearch,
    objectiveFilter,
    statusFilter,
    setCampaignFilter,
    setCampaignNameSearch,
    setObjectiveFilter,
    setStatusFilter,
    activeView,
    setActiveView,
    creativeDialogInfo,
    setCreativeDialogInfo,
    showDebug,
    setShowDebug,
    isGoalsDialogOpen,
    setIsGoalsDialogOpen,
    accountOptions,
    campaignOptions,
    objectiveOptions,
    statusOptions,
    activeFilterChips,
    hasActiveFilters,
    hasPendingChanges,
    hasSelectedAccounts,
    accounts,
    metricsData: metricsQuery.data,
    isLoading: metricsQuery.isLoading,
    isFetching: metricsQuery.isFetching,
    isError: metricsQuery.isError,
    error: metricsQuery.error ?? null,
    refetch: metricsQuery.refetch,
    topCreativesByAccount,
    isTopCreativesLoading: topCreativesQuery.isLoading,
    isTopCreativesFetching: topCreativesQuery.isFetching,
    isTopCreativesError: topCreativesQuery.isError,
    topCreativesError: topCreativesQuery.error ?? null,
    refetchTopCreatives: topCreativesQuery.refetch,
    loadingProgress,
    loadingStatusLabel,
    isPrintReady,
    campaignIndex,
    kpis,
    timelineData,
    leadsByAccountData,
    spendByAccountData,
    funnelSteps,
    quickRanges,
    isGoalsLoading: hasSelectedAccounts && metricsQuery.isLoading && !metricsQuery.data,
    goalsButtonLabel,
    isSavingGoals: saveGoalsMutation.isPending,
    saveGoals: saveGoalsMutation.mutateAsync,
    applyQuickRange,
    applyFilters,
    sameRange,
    clearAllFilters,
    openCampaignCreatives,
    handleAccountsChange,
  };
}
