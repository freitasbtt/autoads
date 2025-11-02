"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DateRange } from "react-day-picker";
import {
  endOfMonth,
  format as formatDate,
  isSameDay,
  startOfMonth,
  subDays,
} from "date-fns";

import {
  CalendarIcon,
  ChevronsUpDown,
  Check,
  Filter,
  DollarSign,
  MousePointerClick,
  TrendingUp,
  Users,
  Loader2,
  BarChart3,
  X,
  Bug,
} from "lucide-react";

import KPICard from "@/components/KPICard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import type { Campaign, Resource } from "@shared/schema";
import { CampaignCreativesDialog } from "@/components/CampaignCreativesDialog";

/* -------------------------------------------------
 * Tipos retornados pela API interna
 * ------------------------------------------------- */

type MetricTotals = {
  spend: number;
  resultSpend: number;
  impressions: number;
  clicks: number;
  leads: number;
  results: number;
  costPerResult: number | null;
};

type DashboardCampaignMetrics = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  metrics: MetricTotals;
  resultado?: {
    label: string;
    quantidade: number | null;
    custo_por_resultado: number | null;
    optimization_goal?: string | null;
    detalhes?: Array<{
      tipo: string;
      label: string;
      quantidade: number;
      custo_por_resultado: number | null;
    }>;
    adsets?: Array<{
      adset_id: string;
      adset_name: string | null;
      optimization_goal: string | null;
      action_type: string | null;
      label: string;
      quantidade: number;
      custo_por_resultado: number | null;
      spend: number;
      impressions: number;
      clicks: number;
    }>;
  };
};

type CampaignHeaderSnapshot = {
  spend: number;
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  ctr: number | null;
};

type DashboardAccountMetrics = {
  id: number;
  name: string;
  value: string;
  metrics: MetricTotals;
  campaigns: DashboardCampaignMetrics[];
};

type DashboardMetricsResponse = {
  dateRange: {
    start: string | null;
    end: string | null;
    previousStart: string | null;
    previousEnd: string | null;
  };
  totals: MetricTotals;
  previousTotals: MetricTotals;
  accounts: DashboardAccountMetrics[];
};

const EMPTY_TOTALS: MetricTotals = {
  spend: 0,
  resultSpend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  results: 0,
  costPerResult: null,
};

/* -------------------------------------------------
 * Tipos de usuário logado pra controle de permissão
 * ------------------------------------------------- */

type CurrentUser = {
  id: number;
  name: string;
  email?: string;
  role?: string;        // ex: "system_admin"
  roles?: string[];     // ex: ["system_admin", "tenant_admin"]
};

/* -------------------------------------------------
 * Helpers
 * ------------------------------------------------- */

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const dateRangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatCurrency(v: number | null | undefined) {
  if (!v || !Number.isFinite(v)) return "R$ 0,00";
  return currencyFormatter.format(v);
}

function formatInteger(v: number | null | undefined) {
  if (!v || !Number.isFinite(v)) return "0";
  return integerFormatter.format(v);
}

function formatPercent(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function getCTR(clicks: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

function buildDefaultRange(): DateRange {
  const end = new Date();
  const start = subDays(end, 29);
  return { from: start, to: end };
}

function normalizeRange(range: DateRange | null): DateRange {
  if (!range || !range.from) {
    const def = buildDefaultRange();
    return { from: def.from, to: def.to };
  }
  if (!range.to) {
    return { from: range.from, to: range.from };
  }
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();
  return fromTime <= toTime
    ? { from: range.from, to: range.to }
    : { from: range.to, to: range.from };
}

function labelFromRange(r: DateRange): string {
  if (!r.from || !r.to) return "Selecione um período";
  const start = dateRangeFormatter.format(r.from).replace(/\./g, "");
  const end = dateRangeFormatter.format(r.to).replace(/\./g, "");
  return `${start} - ${end}`;
}

function calcTrend(
  current: number | null,
  previous: number | null,
  invertGood = false,
) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return undefined;
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(delta)) return undefined;
  return {
    value: `${Math.abs(delta).toFixed(1)}%`,
    positive: invertGood ? delta <= 0 : delta >= 0,
  };
}

const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD: "Geração de Leads",
  TRAFFIC: "Tráfego",
  CONVERSIONS: "Conversões",
  REACH: "Alcance",
  WHATSAPP: "WhatsApp",
  SALES: "Vendas",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Removida",
  DISCARDED: "Descartada",
};

function getObjectiveLabel(v: string | null | undefined): string {
  if (!v) return "";
  const upper = v.toUpperCase();
  return OBJECTIVE_LABELS[upper] ?? upper;
}

function getStatusLabel(v: string | null | undefined): string {
  if (!v) return "Status não informado";
  const upper = v.toUpperCase();
  return STATUS_LABELS[upper] ?? upper;
}

function summarizeResult(
  metrics: MetricTotals,
  resultado?: {
    label: string;
    quantidade: number | null;
    custo_por_resultado: number | null;
  },
) {
  if (resultado && resultado.quantidade !== null) {
    return {
      label: resultado.label || "Resultado",
      quantidade: resultado.quantidade,
      custo:
        resultado.custo_por_resultado !== null
          ? resultado.custo_por_resultado
          : metrics.costPerResult,
    };
  }

  const qty =
    (metrics.results && metrics.results > 0
      ? metrics.results
      : null) ??
    (metrics.leads && metrics.leads > 0 ? metrics.leads : null) ??
    null;

  const cost =
    metrics.costPerResult ??
    (qty && qty > 0 ? metrics.resultSpend / qty : null);

  return {
    label: resultado?.label || "Resultado",
    quantidade: qty,
    custo: cost ?? null,
  };
}

function buildCampaignHeaderSnapshot(
  campaign: DashboardCampaignMetrics,
): CampaignHeaderSnapshot {
  const summary = summarizeResult(campaign.metrics, campaign.resultado);
  const ctr = getCTR(
    campaign.metrics.clicks,
    campaign.metrics.impressions,
  );
  return {
    spend: campaign.metrics.spend,
    resultLabel: summary.label,
    resultQuantity: summary.quantidade,
    costPerResult: summary.custo,
    ctr,
  };
}

/* -------------------------------------------------
 * Subcomponentes
 * ------------------------------------------------- */

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

function AccountMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

function FilterCombobox({
  label,
  placeholder,
  emptyLabel,
  options,
  value,
  onChange,
  testId,
  className,
}: {
  label: string;
  placeholder: string;
  emptyLabel: string;
  options: FilterOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  testId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            data-testid={testId}
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate text-left">
              {selected ? (
                <>
                  <span className="font-medium">{selected.label}</span>
                  {selected.description && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      — {selected.description}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {placeholder}
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 w-[260px] p-0"
        >
          <Command>
            <CommandInput
              placeholder={`Buscar ${label.toLowerCase()}`}
              className="text-sm"
            />
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </CommandEmpty>
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                  Todas
                </CommandItem>

                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="truncate font-medium text-sm leading-tight">
                        {opt.label}
                      </span>
                      {opt.description && (
                        <span className="truncate text-xs text-muted-foreground leading-tight">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// calendário atualizado com z-index e sem empurrar layout
function DateRangePickerField({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = labelFromRange(value);

  const handleSelect = (next: DateRange | undefined) => {
    if (!next || !next.from) {
      onChange(null);
      return;
    }
    if (!next.to) {
      const fixed = { from: next.from, to: next.from };
      onChange(fixed);
      return;
    }
    const normalized = normalizeRange(next);
    onChange(normalized);
    setOpen(false);
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Período
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{currentLabel}</span>
            <ChevronsUpDown className="ml-auto h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 w-auto p-0"
        >
          <div className="flex flex-col gap-3 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Selecione o período
            </div>

            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={value}
              disabled={{ after: new Date() }}
              onSelect={handleSelect}
            />

            <div className="flex justify-between">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  onChange(normalizeRange(buildDefaultRange()));
                  setOpen(false);
                }}
              >
                Voltar padrão
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Limpar período
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* -------------------------------------------------
 * Página principal
 * ------------------------------------------------- */

export default function Dashboard() {
  // datas
  const [rawRange, setRawRange] = useState<DateRange | null>(null);
  const normalizedRange = useMemo(
    () => normalizeRange(rawRange),
    [rawRange],
  );

  const resolvedFrom = normalizedRange.from!;
  const resolvedTo = normalizedRange.to!;
  const startDateStr = formatDate(resolvedFrom, "yyyy-MM-dd");
  const endDateStr = formatDate(resolvedTo, "yyyy-MM-dd");
  const periodLabel = labelFromRange(normalizedRange);

  // filtros
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [campaignFilter, setCampaignFilter] = useState<string | null>(
    null,
  );
  const [objectiveFilter, setObjectiveFilter] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // modal criativos
  const [creativeDialogInfo, setCreativeDialogInfo] = useState<{
    campaign: DashboardCampaignMetrics;
    account: string;
    header: CampaignHeaderSnapshot;
  } | null>(null);

  // debug toggle local
  const [showDebug, setShowDebug] = useState(false);

  /* --------------------------------------
   * Usuário logado (pra RBAC / permissões)
   * -------------------------------------- */
  const { data: me } = useQuery<CurrentUser>({
    queryKey: ["/api/me"],
  });

  // apenas system_admin pode ver debug
  const isSystemAdmin = useMemo(() => {
    if (!me) return false;
    if (me.role && me.role === "system_admin") return true;
    if (Array.isArray(me.roles) && me.roles.includes("system_admin"))
      return true;
    return false;
  }, [me]);

  /* --------------------------------------
   * Listagem de contas (resources)
   * -------------------------------------- */
  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const accountResources = useMemo(
    () => resources.filter((r) => r.type === "account"),
    [resources],
  );

  const accountLookup = useMemo(() => {
    const map = new Map<number, { name: string; value: string }>();
    for (const acc of accountResources) {
      map.set(acc.id, { name: acc.name, value: acc.value });
    }
    return map;
  }, [accountResources]);

  const accountOptions: FilterOption[] = useMemo(
    () =>
      accountResources
        .map((acc) => ({
          value: String(acc.id),
          label: acc.name,
          description: acc.value,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [accountResources],
  );

  /* --------------------------------------
   * Catálogo de campanhas local (fallback p/ combobox)
   * -------------------------------------- */
  const { data: campaignsCatalog = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  /* --------------------------------------
   * Query principal (só roda se tiver conta)
   * -------------------------------------- */
  const params = new URLSearchParams({
    startDate: startDateStr,
    endDate: endDateStr,
  });
  if (selectedAccountId) params.set("accountId", selectedAccountId);
  if (campaignFilter) params.set("campaignId", campaignFilter);
  if (objectiveFilter) params.set("objective", objectiveFilter);
  if (statusFilter) params.set("status", statusFilter);

  const endpoint = selectedAccountId
    ? `/api/dashboard/metrics?${params.toString()}`
    : null;

  const {
    data: metricsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<DashboardMetricsResponse, Error>({
    queryKey: endpoint ? [endpoint] : ["dashboard-disabled"],
    enabled: endpoint !== null,
    queryFn: async () => {
      if (!endpoint) throw new Error("Nenhuma conta selecionada.");
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Erro ao carregar métricas.");
      return res.json();
    },
  });

  const accounts: DashboardAccountMetrics[] =
    metricsData?.accounts ?? [];

  /* --------------------------------------
   * Opções dinâmicas dos filtros
   * -------------------------------------- */

  // campanhas disponíveis (API => prioridade / fallback => catálogo)
  const campaignOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: FilterOption[] = [];
    const filterAcc = selectedAccountId ?? null;

    for (const acc of accounts) {
      if (filterAcc && String(acc.id) !== filterAcc) continue;
      for (const camp of acc.campaigns) {
        if (!camp.id || seen.has(camp.id)) continue;
        seen.add(camp.id);
        const acctPiece = acc.name;
        const objPiece = getObjectiveLabel(camp.objective);
        opts.push({
          value: camp.id,
          label: camp.name ?? `Campanha ${camp.id}`,
          description: [objPiece, acctPiece].filter(Boolean).join(" - "),
        });
      }
    }

    if (opts.length === 0 && campaignsCatalog.length > 0) {
      for (const camp of campaignsCatalog) {
        const accId = camp.accountId ?? null;
        if (filterAcc && accId !== Number(filterAcc)) continue;

        const lookup = accId ? accountLookup.get(accId) : undefined;
        const acctPiece = lookup?.name;
        const objPiece = getObjectiveLabel(camp.objective);

        const idStr = String(camp.id);
        if (seen.has(idStr)) continue;
        seen.add(idStr);

        opts.push({
          value: idStr,
          label: camp.name ?? `Campanha ${camp.id}`,
          description: [objPiece, acctPiece].filter(Boolean).join(" - "),
        });
      }
    }

    return opts.sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
  }, [accounts, campaignsCatalog, selectedAccountId, accountLookup]);

  // se campanha selecionada não existe mais, limpa
  useEffect(() => {
    if (
      campaignFilter &&
      !campaignOptions.some((o) => o.value === campaignFilter)
    ) {
      setCampaignFilter(null);
    }
  }, [campaignFilter, campaignOptions]);

  // objetivos
  const objectiveOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: FilterOption[] = [];
    const add = (raw?: string | null) => {
      if (!raw) return;
      const key = raw.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      opts.push({
        value: key,
        label: getObjectiveLabel(key),
      });
    };

    for (const acc of accounts) {
      if (
        selectedAccountId &&
        String(acc.id) !== String(selectedAccountId)
      )
        continue;
      for (const camp of acc.campaigns) {
        add(camp.objective);
      }
    }

    if (opts.length === 0 && campaignsCatalog.length > 0) {
      for (const c of campaignsCatalog) {
        if (
          selectedAccountId &&
          c.accountId !== Number(selectedAccountId)
        )
          continue;
        add(c.objective ?? null);
      }
    }

    return opts.sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
  }, [accounts, campaignsCatalog, selectedAccountId]);

  useEffect(() => {
    if (
      objectiveFilter &&
      !objectiveOptions.some((o) => o.value === objectiveFilter)
    ) {
      setObjectiveFilter(null);
    }
  }, [objectiveFilter, objectiveOptions]);

  // status
  const statusOptions: FilterOption[] = useMemo(() => {
    const seen = new Set<string>();
    const opts: FilterOption[] = [];

    for (const acc of accounts) {
      for (const camp of acc.campaigns) {
        const raw = camp.status ?? "";
        if (!raw) continue;
        const upper = raw.toUpperCase();
        if (seen.has(upper)) continue;
        seen.add(upper);
        opts.push({
          value: upper,
          label: getStatusLabel(upper),
        });
      }
    }

    if (opts.length === 0) {
      Object.keys(STATUS_LABELS).forEach((statusKey) => {
        opts.push({
          value: statusKey,
          label: getStatusLabel(statusKey),
        });
      });
    }

    return opts.sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
  }, [accounts]);

  useEffect(() => {
    if (
      statusFilter &&
      !statusOptions.some((o) => o.value === statusFilter)
    ) {
      setStatusFilter(null);
    }
  }, [statusFilter, statusOptions]);

  /* --------------------------------------
   * Chips de filtros ativos
   * -------------------------------------- */
  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      label: string;
      value: string;
      onRemove: () => void;
    }> = [];

    if (selectedAccountId) {
      const accOpt = accountOptions.find(
        (o) => o.value === selectedAccountId,
      );
      chips.push({
        label: "Conta",
        value: accOpt?.label ?? `ID ${selectedAccountId}`,
        onRemove: () => setSelectedAccountId(null),
      });
    }

    if (campaignFilter) {
      const campOpt = campaignOptions.find(
        (o) => o.value === campaignFilter,
      );
      chips.push({
        label: "Campanha",
        value: campOpt?.label ?? `ID ${campaignFilter}`,
        onRemove: () => setCampaignFilter(null),
      });
    }

    if (objectiveFilter) {
      const objOpt = objectiveOptions.find(
        (o) => o.value === objectiveFilter,
      );
      chips.push({
        label: "Objetivo",
        value:
          objOpt?.label ?? getObjectiveLabel(objectiveFilter),
        onRemove: () => setObjectiveFilter(null),
      });
    }

    if (statusFilter) {
      const stOpt = statusOptions.find(
        (o) => o.value === statusFilter,
      );
      chips.push({
        label: "Status",
        value:
          stOpt?.label ?? getStatusLabel(statusFilter),
        onRemove: () => setStatusFilter(null),
      });
    }

    return chips;
  }, [
    selectedAccountId,
    accountOptions,
    campaignFilter,
    campaignOptions,
    objectiveFilter,
    objectiveOptions,
    statusFilter,
    statusOptions,
  ]);

  const hasActiveFilters =
    !!selectedAccountId ||
    !!campaignFilter ||
    !!objectiveFilter ||
    !!statusFilter;

  function clearAllFilters() {
    setSelectedAccountId(null);
    setCampaignFilter(null);
    setObjectiveFilter(null);
    setStatusFilter(null);
    setCreativeDialogInfo(null);
  }

  /* --------------------------------------
   * KPIs globais
   * -------------------------------------- */
  const kpis = useMemo(() => {
    const totals = metricsData?.totals ?? EMPTY_TOTALS;
    const previous = metricsData?.previousTotals ?? EMPTY_TOTALS;

    const ctrNow = getCTR(totals.clicks, totals.impressions);
    const ctrPrev = getCTR(previous.clicks, previous.impressions);

    const resNow = summarizeResult(totals);
    const resPrev = summarizeResult(previous);

    const agoraQtd = resNow.quantidade ?? 0;
    const antesQtd = resPrev.quantidade ?? 0;

    const agoraCusto = resNow.custo ?? null;
    const antesCusto = resPrev.custo ?? null;

    return [
      {
        title: "Total Resultados",
        value:
          resNow.quantidade !== null && resNow.quantidade !== undefined
            ? formatInteger(resNow.quantidade)
            : "—",
        icon: Users,
        trend: calcTrend(agoraQtd, antesQtd),
      },
      {
        title: "Custo por Resultado (médio)",
        value:
          agoraCusto !== null && agoraCusto !== undefined
            ? formatCurrency(agoraCusto)
            : "—",
        icon: TrendingUp,
        trend: calcTrend(agoraCusto, antesCusto, true),
      },
      {
        title: "Total Gasto",
        value: formatCurrency(totals.spend),
        icon: DollarSign,
        trend: calcTrend(totals.spend, previous.spend),
      },
      {
        title: "CTR Média",
        value: formatPercent(ctrNow),
        icon: MousePointerClick,
        trend: calcTrend(ctrNow, ctrPrev),
      },
    ];
  }, [metricsData]);

  /* --------------------------------------
   * Quick ranges (Últimos 7/30/Este mês)
   * -------------------------------------- */
  const quickRanges = useMemo(() => {
    const now = new Date();
    return [
      {
        label: "Últimos 7 dias",
        range: {
          from: subDays(now, 6),
          to: now,
        },
      },
      {
        label: "Últimos 30 dias",
        range: {
          from: subDays(now, 29),
          to: now,
        },
      },
      {
        label: "Este mês",
        range: {
          from: startOfMonth(now),
          to: endOfMonth(now),
        },
      },
    ];
  }, []);

  function sameRange(a: DateRange, b: DateRange) {
    if (!a.from || !a.to || !b.from || !b.to) return false;
    return isSameDay(a.from, b.from) && isSameDay(a.to, b.to);
  }

  function applyQuickRange(r: DateRange) {
    const norm = normalizeRange(r);
    setRawRange(norm);
  }

  /* --------------------------------------
   * tabela de contas/campanhas
   * -------------------------------------- */
  const renderAccountsTable = () => {
    if (!endpoint) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <span className="text-muted-foreground">
              Selecione uma{" "}
              <b className="text-foreground">Conta de anúncio</b>{" "}
              para carregar os dados.
            </span>
          </CardContent>
        </Card>
      );
    }

    if (isLoading && !metricsData) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Carregando métricas…</span>
            </div>
            <div className="mx-auto h-3 w-1/2 animate-pulse rounded bg-muted/60" />
          </CardContent>
        </Card>
      );
    }

    if (isError) {
      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <BarChart3 className="h-4 w-4" />
              Falha ao carregar métricas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {error?.message ??
                "Ocorreu um erro inesperado ao buscar os dados."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (!metricsData || accounts.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Nenhum resultado encontrado para os filtros selecionados. Ajuste os filtros ou revise o período."
              : "Nenhuma métrica encontrado para o período escolhido. Ajuste o filtro de datas ou verifique se esta conta possui dados sincronizados."}
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        {accounts.map((account) => {
          const summary = summarizeResult(account.metrics);
          const ctr = getCTR(
            account.metrics.clicks,
            account.metrics.impressions,
          );

          return (
            <Card
              key={account.id}
              data-testid={`card-account-${account.id}`}
            >
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg font-semibold leading-tight">
                  {account.name}
                </CardTitle>
                <p className="font-mono text-sm text-muted-foreground leading-tight">
                  {account.value}
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* resumo conta */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <AccountMetric
                    label="Gasto"
                    value={formatCurrency(account.metrics.spend)}
                  />
                  <AccountMetric
                    label={summary.label}
                    value={
                      summary.quantidade !== null
                        ? formatInteger(summary.quantidade)
                        : "N/D"
                    }
                  />
                  <AccountMetric
                    label="Custo por resultado"
                    value={
                      summary.custo !== null
                        ? formatCurrency(summary.custo)
                        : "N/D"
                    }
                  />
                  <AccountMetric
                    label="CTR"
                    value={formatPercent(ctr)}
                  />
                </div>

                {/* tabela campanhas */}
                {account.campaigns.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? "Nenhuma campanha corresponde aos filtros."
                      : "Nenhuma campanha encontrada para essa conta no período."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                            Campanha
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                            Objetivo
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                            Gasto
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                            Resultado
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                            Custo/Resultado
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                            CTR
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground"></th>
                        </tr>
                      </thead>

                      <tbody>
                        {account.campaigns.map((camp) => {
                          const res = summarizeResult(
                            camp.metrics,
                            camp.resultado,
                          );
                          const ctrCamp = getCTR(
                            camp.metrics.clicks,
                            camp.metrics.impressions,
                          );

                          const displayName =
                            camp.name ?? `Campanha ${camp.id}`;
                          const objLabel = getObjectiveLabel(
                            camp.objective,
                          );

                          const rawStatus = camp.status ?? "";
                          const statusLabel = rawStatus
                            ? getStatusLabel(rawStatus)
                            : null;
                          const isActive =
                            rawStatus.toLowerCase() === "active";

                          return (
                            <tr
                              key={camp.id}
                              className="border-b last:border-none hover:bg-muted/30"
                            >
                              <td className="px-4 py-4 align-top">
                                <div className="flex flex-col">
                                  <span className="font-medium leading-tight">
                                    {displayName}
                                  </span>
                                  <span className="text-xs text-muted-foreground leading-tight">
                                    ID #{camp.id}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-4 align-top">
                                {objLabel ? (
                                  <Badge variant="outline">
                                    {objLabel}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4 align-top">
                                {statusLabel ? (
                                  <Badge
                                    variant={
                                      isActive
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {statusLabel}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4 text-right font-mono align-top">
                                {formatCurrency(camp.metrics.spend)}
                              </td>

                              <td className="px-4 py-4 text-right align-top">
                                <div className="flex flex-col items-end">
                                  <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground leading-tight">
                                    {res.label}
                                  </span>
                                  <span className="font-semibold text-foreground leading-tight">
                                    {res.quantidade !== null
                                      ? formatInteger(res.quantidade)
                                      : "N/D"}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-4 text-right font-mono align-top">
                                {res.custo !== null
                                  ? formatCurrency(res.custo)
                                  : "N/D"}
                              </td>

                              <td className="px-4 py-4 text-right font-mono align-top">
                                {formatPercent(ctrCamp)}
                              </td>

                              <td className="px-4 py-4 text-right align-top">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setCreativeDialogInfo({
                                      campaign: camp,
                                      account: account.value,
                                      header:
                                        buildCampaignHeaderSnapshot(
                                          camp,
                                        ),
                                    })
                                  }
                                >
                                  Ver criativos
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </>
    );
  };

  /* --------------------------------------
   * render principal
   * -------------------------------------- */
  return (
    <>
      <div className="space-y-6 p-6">
        {/* HEADER SUPERIOR */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold leading-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground leading-tight">
              Visão geral das contas e campanhas Meta Ads no período
              selecionado
            </p>

            <p className="text-[0.7rem] leading-tight text-muted-foreground">
              Período aplicado:{" "}
              <span className="font-medium text-foreground">
                {periodLabel}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            {isFetching && endpoint && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Atualizando dados…</span>
              </span>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button data-testid="button-new-campaign">
                Nova Campanha
              </Button>

              {isSystemAdmin && (
                <Button
                  variant={showDebug ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowDebug((s) => !s)}
                  className="flex items-center gap-1"
                >
                  <Bug className="h-4 w-4" />
                  {showDebug ? "Ocultar debug" : "Ver debug bruto"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* CARD DE FILTROS E KPIs */}
        <Card>
          <CardContent className="space-y-6 pt-6 relative">
            {/* LINHA 1: Filtros ativos / limpar */}
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    <span>
                      {hasActiveFilters
                        ? `Filtros (${activeFilterChips.length})`
                        : "Filtros"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-60" />
                  </Button>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      data-testid="button-clear-filters"
                    >
                      Limpar filtros
                    </Button>
                  )}

                  {activeFilterChips.map((chip) => (
                    <Badge
                      key={`${chip.label}-${chip.value}`}
                      variant="secondary"
                      className="flex items-center gap-1 rounded-full px-3 py-1 text-[0.7rem]"
                    >
                      <span className="font-semibold uppercase tracking-tight text-muted-foreground">
                        {chip.label}:
                      </span>
                      <span className="truncate">{chip.value}</span>
                      <button
                        type="button"
                        onClick={chip.onRemove}
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground focus:outline-none"
                        aria-label={`Remover filtro ${chip.label.toLowerCase()}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="text-[0.7rem] leading-tight text-muted-foreground">
                  Período aplicado:{" "}
                  <span className="font-medium text-foreground">
                    {periodLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* LINHA 2: atalhos + selects */}
            <div className="flex flex-col gap-4">
              {/* atalhos rápidos */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Atalhos de período
                </span>

                {quickRanges.map((preset) => {
                  const isOn = sameRange(normalizedRange, preset.range);
                  return (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant={isOn ? "default" : "outline"}
                      onClick={() => applyQuickRange(preset.range)}
                      className="rounded-full text-xs"
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>

              {/* filtros detalhados (grid responsiva) */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {/* Período */}
                <div className="xl:col-span-2">
                  <DateRangePickerField
                    value={normalizedRange}
                    onChange={setRawRange}
                  />
                </div>

                {/* Conta (obrigatório pra fetch) */}
                <FilterCombobox
                  label="Conta de anúncio"
                  placeholder="Selecione uma conta"
                  emptyLabel="Nenhuma conta encontrada"
                  options={accountOptions}
                  value={selectedAccountId}
                  onChange={(val) => {
                    setSelectedAccountId(val);
                    setCampaignFilter(null);
                    setObjectiveFilter(null);
                    setStatusFilter(null);
                    setCreativeDialogInfo(null);
                  }}
                  testId="filter-account"
                  className="xl:col-span-1"
                />

                {/* Campanha */}
                <FilterCombobox
                  label="Campanha"
                  placeholder="Todas as campanhas"
                  emptyLabel="Nenhuma campanha encontrada"
                  options={campaignOptions}
                  value={campaignFilter}
                  onChange={setCampaignFilter}
                  testId="filter-campaign"
                  className="xl:col-span-1"
                />

                {/* Objetivo */}
                <FilterCombobox
                  label="Objetivo"
                  placeholder="Todos os objetivos"
                  emptyLabel="Nenhum objetivo encontrado"
                  options={objectiveOptions}
                  value={objectiveFilter}
                  onChange={setObjectiveFilter}
                  testId="filter-objective"
                  className="xl:col-span-1"
                />

                {/* Status */}
                <FilterCombobox
                  label="Status da campanha"
                  placeholder="Todos os status"
                  emptyLabel="Status não encontrado"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  testId="filter-status"
                  className="xl:col-span-1"
                />
              </div>
            </div>

            {/* LINHA 3: KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <div
                  key={kpi.title}
                  className="relative flex flex-col rounded-md border bg-card p-4 shadow-sm"
                >
                  <div className="absolute right-4 top-4 text-muted-foreground/60">
                    <kpi.icon className="h-4 w-4" />
                  </div>

                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {kpi.title}
                  </div>

                  <div className="mt-2 text-2xl font-semibold leading-none tracking-tight">
                    {kpi.value}
                  </div>

                  {kpi.trend && (
                    <div
                      className={cn(
                        "mt-2 flex items-center gap-1 text-xs font-medium",
                        kpi.trend.positive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>{kpi.trend.value}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* TABELA PRINCIPAL */}
        {renderAccountsTable()}

        {/* DEBUG (somente system_admin) */}
        {isSystemAdmin && showDebug && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium leading-tight">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Debug / Payload cru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[400px] overflow-auto rounded bg-muted p-4 text-xs leading-snug">
                {JSON.stringify(
                  {
                    request: {
                      startDate: startDateStr,
                      endDate: endDateStr,
                      accountId: selectedAccountId,
                      campaignId: campaignFilter,
                      objective: objectiveFilter,
                      status: statusFilter,
                    },
                    response: metricsData ?? null,
                  },
                  null,
                  2,
                )}
              </pre>
              <p className="pt-2 text-[0.7rem] leading-tight text-muted-foreground">
                Esses dados vêm direto da API interna já agregada.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* MODAL: Criativos */}
      <CampaignCreativesDialog
        open={!!creativeDialogInfo}
        onClose={() => setCreativeDialogInfo(null)}
        campaign={creativeDialogInfo?.campaign ?? null}
        account={creativeDialogInfo?.account ?? null}
        headerSnapshot={creativeDialogInfo?.header ?? null}
        startDate={startDateStr}
        endDate={endDateStr}
      />
    </>
  );
}
