"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { Campaign, Resource } from "@shared/schema";

/* ------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------ */

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

  // já vem do backend com a "ação principal" escolhida
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

  metrics: MetricTotals;
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

type InsightAction = {
  type: string;
  value: number;
};

type InsightCost = {
  type: string;
  value: number | null;
};

type CampaignInsightsResponse = {
  campaignId: string;
  campaignName: string | null;
  objective: string | null;
  dateRange: {
    start: string | null;
    end: string | null;
    preset: string | null;
  };
  totals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
  };
  actions: InsightAction[];
  actionValues: InsightAction[];
  costPerActionType: InsightCost[];
};

type KPICardTrend = {
  value: string;
  positive: boolean;
};

type KPICardData = {
  title: string;
  value: string;
  icon: typeof DollarSign;
  trend?: KPICardTrend;
};

type DateRangeSelectorProps = {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
};

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

type CampaignFilterOption = FilterOption & {
  accountId: number | null;
  objective?: string | null;
};

type QuickRange = {
  label: string;
  range: DateRange;
};

type AccountMetricProps = {
  label: string;
  value: string;
};

/* ------------------------------------------------------------------
 * Helpers / formatters
 * ------------------------------------------------------------------ */

const defaultTotals: MetricTotals = {
  spend: 0,
  resultSpend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  results: 0,
  costPerResult: null,
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const rangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD: "Geração de Leads",
  TRAFFIC: "Tráfego",
  CONVERSIONS: "Conversões",
  REACH: "Alcance",
  WHATSAPP: "WhatsApp",
  SALES: "Vendas",
};

const OPTIMIZATION_GOAL_LABELS: Record<string, string> = {
  LEAD_GENERATION: "Otimização para Leads",
  MESSAGES: "Otimização para Mensagens",
  PURCHASE: "Otimização para Compras",
  LANDING_PAGE_VIEWS: "Otimização para Página de destino",
  LINK_CLICKS: "Otimização para Cliques no link",
  POST_ENGAGEMENT: "Otimização para Engajamento",
  OUTCOME_ENGAGEMENT: "Otimização para Engajamento",
  OUTCOME_SALES: "Otimização para Vendas",
  OUTCOME_TRAFFIC: "Otimização para Tráfego",
  OUTCOME_REACH: "Otimização para Alcance",
};

function getObjectiveLabel(value: string | null | undefined): string {
  if (!value) return "";
  const upper = value.toUpperCase();
  return OBJECTIVE_LABELS[upper] ?? upper;
}

function getOptimizationGoalLabel(value: string | null | undefined): string {
  if (!value) return "Objetivo não informado";
  const upper = value.toUpperCase();
  return OPTIMIZATION_GOAL_LABELS[upper] ?? upper;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Removida",
  DISCARDED: "Descartada",
};

function getStatusLabel(value: string | null | undefined): string {
  if (!value) return "Status não informado";
  const upper = value.toUpperCase();
  return STATUS_LABELS[upper] ?? upper;
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

function formatPercentage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(2)}%`;
}

function createDefaultRange(): DateRange {
  const end = new Date();
  const start = subDays(end, 29); // últimos 30 dias
  return { from: start, to: end };
}

function formatRangeLabel(range: DateRange): string {
  if (!range.from || !range.to) {
    return "Selecione um período";
  }
  const start = rangeFormatter.format(range.from).replace(/\./g, "");
  const end = rangeFormatter.format(range.to).replace(/\./g, "");
  return `${start} - ${end}`;
}

function buildTrend(
  current: number | null,
  previous: number | null,
  invert = false,
): KPICardTrend | undefined {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return undefined;
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) {
    return undefined;
  }

  return {
    value: `${Math.abs(change).toFixed(1)}%`,
    positive: invert ? change <= 0 : change >= 0,
  };
}

function calcCTR(clicks: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

function calcCPL(spend: number, results: number | null): number | null {
  if (!results || results <= 0) return null;
  return spend / results;
}

/**
 * Extrai o "resultado principal" que a gente quer exibir:
 * - Tenta usar o campo `resultado` que já vem priorizado do backend
 * - Se não tiver, cai num fallback lógico usando MetricTotals
 */
function extractResultSummary(
  metrics: MetricTotals,
  resultado?: {
    label: string;
    quantidade: number | null;
    custo_por_resultado: number | null;
  },
): {
  label: string;
  quantidade: number | null;
  custo: number | null;
  } {
    if (resultado) {
      if (resultado.quantidade !== null) {
        return {
          label: resultado.label || "Resultado",
          quantidade: resultado.quantidade,
          custo: resultado.custo_por_resultado,
        };
      }

      return {
        label: resultado.label || "Resultado",
        quantidade: null,
        custo: resultado.custo_por_resultado,
      };
    }

    // fallback quando não existe `resultado`
  const rawQty =
    (Number.isFinite(metrics.results) && metrics.results > 0
      ? metrics.results
      : null) ??
    (Number.isFinite(metrics.leads) && metrics.leads > 0
      ? metrics.leads
      : null) ??
    null;

  const fallbackCost =
    metrics.costPerResult ??
    (rawQty && rawQty > 0 ? metrics.resultSpend / rawQty : null);

  return {
    label: "Resultado",
    quantidade: rawQty,
    custo: fallbackCost ?? null,
  };
}

/* ------------------------------------------------------------------
 * Mini componentes visuais
 * ------------------------------------------------------------------ */

function AccountMetric({ label, value }: AccountMetricProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const displayLabel =
    value && value.from && value.to
      ? formatRangeLabel(value)
      : "Selecione um período";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            (!value || !value.from || !value.to) && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span>{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="end">
        <Calendar
          initialFocus
          mode="range"
          numberOfMonths={2}
          selected={value ?? undefined}
          disabled={{ after: new Date() }}
          onSelect={(range) => {
            if (!range?.from) {
              onChange(null);
              return;
            }
            onChange({
              from: range.from,
              to: range.to ?? range.from,
            });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface FilterComboboxProps {
  label: string;
  placeholder: string;
  emptyLabel: string;
  options: FilterOption[];
  value: string | null;
  onChange: (nextValue: string | null) => void;
  testId: string;
  className?: string;
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
}: FilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid={testId}
          >
            <span className="truncate">
              {selected ? (
                selected.label
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}`} />
            <CommandEmpty>{emptyLabel}</CommandEmpty>
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
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
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

/* ------------------------------------------------------------------
 * Modal de Insights (drilldown da campanha)
 * ------------------------------------------------------------------ */

type InsightsDialogProps = {
  open: boolean;
  onClose: () => void;
  campaign: DashboardCampaignMetrics | null;
  account: DashboardAccountMetrics | null;
  baseRange: DateRange;
};

function InsightsDialog({
  open,
  onClose,
  campaign,
  account,
  baseRange,
}: InsightsDialogProps) {
  const [modalRange, setModalRange] = useState<DateRange>(baseRange);

  // sempre que trocar a campanha ou mudar o range base, reseta o modalRange
  useEffect(() => {
    if (campaign && baseRange.from && baseRange.to) {
      setModalRange({
        from: baseRange.from,
        to: baseRange.to,
      });
    }
  }, [campaign, baseRange.from, baseRange.to]);

  const modalFrom = modalRange.from ?? baseRange.from!;
  const modalTo =
    modalRange.to ?? modalRange.from ?? baseRange.to ?? baseRange.from!;

  const insightsEndpoint = campaign
    ? `/api/meta/campaigns/${encodeURIComponent(
        campaign.id,
      )}/metrics?startDate=${formatDate(
        modalFrom,
        "yyyy-MM-dd",
      )}&endDate=${formatDate(modalTo, "yyyy-MM-dd")}`
    : null;

  const {
    data: insightData,
    isLoading: insightLoading,
    isError: insightError,
    error: insightErrorObj,
    refetch: refetchInsights,
  } = useQuery<CampaignInsightsResponse, Error>({
    queryKey: [insightsEndpoint],
    enabled: Boolean(open && insightsEndpoint),
  });

  const modalRangesPresets = useMemo<QuickRange[]>(() => {
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

  const handlePresetClick = (range: DateRange) => {
    const fromDate: Date = range.from ?? new Date();
    const toDate: Date = (range.to ?? range.from ?? fromDate) as Date;
    setModalRange({ from: fromDate, to: toDate });
  };

  // métricas base da campanha
  const spend = insightData?.totals.spend ?? 0;
  const impressions = insightData?.totals.impressions ?? 0;
  const clicks = insightData?.totals.clicks ?? 0;
  const reach = insightData?.totals.reach ?? 0;

  // "ação principal" prioritária pra exibir
  const mainAction = useMemo(() => {
    if (!insightData?.actions) return null;

    // heurística: prioriza coisas tipo lead/conversa/compra antes de clique
    const priority = [
      "lead",
      "leadgen",
      "conversa",
      "mensagem",
      "whatsapp",
      "purchase",
      "compra",
      "resultado",
    ];

    for (const p of priority) {
      const found = insightData.actions.find((a) =>
        a.type.toLowerCase().includes(p),
      );
      if (found) return found;
    }

    // fallback = maior volume
    let top = insightData.actions[0];
    for (const act of insightData.actions) {
      if (act.value > top.value) {
        top = act;
      }
    }
    return top ?? null;
  }, [insightData?.actions]);

  const mainResults = mainAction?.value ?? 0;
  const ctr = calcCTR(clicks, impressions);
  const cpc = clicks > 0 ? spend / clicks : null;
  const cpl = calcCPL(spend, mainResults);

  const adsetBreakdown = useMemo(
    () => campaign?.resultado?.adsets ?? [],
    [campaign],
  );
  const dominantGoalLabel = useMemo(() => {
    const goal = campaign?.resultado?.optimization_goal ?? null;
    return goal ? getOptimizationGoalLabel(goal) : null;
  }, [campaign]);

  const costRows = (insightData?.costPerActionType ?? []).map((row) => ({
    action: row.type,
    cost:
      row.value !== null && Number.isFinite(row.value)
        ? formatCurrency(row.value!)
        : "N/D",
  }));

  const actionRows = (insightData?.actions ?? []).map((row) => ({
    action: row.type,
    qty: row.value,
  }));

  const dialogTitle = campaign
    ? campaign.name || `Campanha ${campaign.id}`
    : "Métricas da campanha";

  const objectiveLabel = getObjectiveLabel(campaign?.objective);

  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto p-0">
        {/* HEADER DO MODAL */}
        <div className="flex items-start justify-between border-b p-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-semibold leading-tight">
              {dialogTitle}
            </DialogTitle>

            <DialogDescription className="text-sm text-muted-foreground">
              {account ? (
                <>
                  Conta:{" "}
                  <span className="font-medium text-foreground">
                    {account.name}
                  </span>{" "}
                  - ID {account.value}
                </>
              ) : (
                "Conta não encontrada"
              )}
              {objectiveLabel && (
                <>
                  {" "}
                  - Objetivo:{" "}
                  <Badge variant="outline" className="align-middle">
                    {objectiveLabel}
                  </Badge>
                </>
              )}
            </DialogDescription>

            <div className="text-[0.7rem] text-muted-foreground">
              Período aplicado:{" "}
              <span className="font-medium text-foreground">
                {formatRangeLabel({
                  from: modalFrom,
                  to: modalTo,
                })}
              </span>
            </div>
          </DialogHeader>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full p-2 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </Button>
        </div>

        <div className="space-y-6 p-4">
          {/* CONTROLES DO PERÍODO DENTRO DO MODAL */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ajustar período
                </span>

                {modalRangesPresets.map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={
                      isSameDay(
                        preset.range.from ?? new Date(),
                        modalFrom ?? new Date(),
                      ) &&
                      isSameDay(
                        (preset.range.to ??
                          preset.range.from ??
                          new Date()) as Date,
                        modalTo ?? new Date(),
                      )
                        ? "default"
                        : "outline"
                    }
                    className="rounded-full"
                    onClick={() => handlePresetClick(preset.range)}
                  >
                    {preset.label}
                  </Button>
                ))}

                <div className="ml-auto flex flex-col gap-1 text-right">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Período customizado
                  </span>
                  <DateRangeSelector
                    value={modalRange}
                    onChange={(r) => {
                      if (!r?.from) return;
                      setModalRange({
                        from: r.from,
                        to: r.to ?? r.from,
                      });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Você pode analisar datas diferentes só dessa campanha, sem
                  alterar o período global do dashboard.
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[0.7rem]"
                  onClick={() => refetchInsights()}
                >
                  <Loader2
                    className={cn(
                      "mr-1 h-3.5 w-3.5 animate-spin",
                      insightLoading ? "opacity-100" : "hidden",
                    )}
                  />
                  Atualizar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ESTADO DE ERRO */}
          {insightError ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <BarChart3 className="h-4 w-4" />
                  Falha ao carregar métricas da campanha
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {insightErrorObj?.message ??
                    "Ocorreu um erro inesperado ao buscar os dados da campanha."}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchInsights()}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPIs PRINCIPAIS DA CAMPANHA */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-muted/30">
                  <CardContent className="space-y-2 pt-6">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Gasto
                    </p>
                    <p className="text-xl font-semibold">
                      {formatCurrency(spend)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="space-y-2 pt-6">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Alcance
                    </p>
                    <p className="text-xl font-semibold">
                      {formatInteger(reach)}
                    </p>
                    <p className="text-[0.7rem] leading-none text-muted-foreground">
                      Pessoas únicas impactadas
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="space-y-2 pt-6">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cliques
                    </p>
                    <p className="text-xl font-semibold">
                      {formatInteger(clicks)}
                    </p>
                    <p className="text-[0.7rem] leading-none text-muted-foreground">
                      CTR: {formatPercentage(ctr)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="space-y-2 pt-6">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Ação principal
                    </p>
                    <p className="text-xl font-semibold">
                      {formatInteger(mainResults)}
                    </p>
                    <p className="text-[0.7rem] leading-none text-muted-foreground">
                      {mainAction
                        ? mainAction.type
                        : "Sem ações relevantes no período"}
                    </p>
                  </CardContent>
                </Card>
              </section>

              {/* MÉTRICAS DERIVADAS (CPL / CPC / CTR) */}
              <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      CPL / CPA
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">
                        Custo por resultado
                      </span>
                      <span className="font-mono text-lg font-semibold">
                        {cpl !== null ? formatCurrency(cpl) : "N/D"}
                      </span>
                    </div>
                    <div className="rounded-md bg-muted p-2 text-[0.7rem] leading-tight text-muted-foreground">
                      Quanto você está pagando, em média, por cada{" "}
                      {mainAction
                        ? mainAction.type.toLowerCase()
                        : "ação registrada"}{" "}
                      nesse período.
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      CPC
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">
                        Custo por clique
                      </span>
                      <span className="font-mono text-lg font-semibold">
                        {cpc !== null ? formatCurrency(cpc) : "N/D"}
                      </span>
                    </div>
                    <div className="rounded-md bg-muted p-2 text-[0.7rem] leading-tight text-muted-foreground">
                      Quanto cada clique efetivo custou no período.
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      CTR
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">
                        Taxa de cliques
                      </span>
                      <span className="font-mono text-lg font-semibold">
                        {formatPercentage(ctr)}
                      </span>
                    </div>
                    <div className="rounded-md bg-muted p-2 text-[0.7rem] leading-tight text-muted-foreground">
                      Relação entre impressões e cliques.
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* AÇÕES REGISTRADAS */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Resultados por ação
                  </h3>
                  <span className="text-[0.7rem] text-muted-foreground">
                    Engajamentos e conversões capturadas pela API
                  </span>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 font-medium">Ação</th>
                        <th className="px-4 py-2 text-right font-medium">
                          Quantidade
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionRows.length === 0 ? (
                        <tr>
                          <td
                            className="px-4 py-6 text-center text-xs text-muted-foreground"
                            colSpan={2}
                          >
                            Nenhuma ação registrada nesse período.
                          </td>
                        </tr>
                      ) : (
                        actionRows.map((row) => (
                          <tr
                            key={row.action}
                            className="border-b last:border-none hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 font-medium">
                              {row.action}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {formatInteger(row.qty)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* CUSTO POR AÇÃO */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Custo por tipo de ação
                  </h3>
                  <span className="text-[0.7rem] text-muted-foreground">
                    Quanto custa gerar cada tipo de resultado
                  </span>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-4 py-2 font-medium">Ação</th>
                        <th className="px-4 py-2 text-right font-medium">
                          Custo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {costRows.length === 0 ? (
                        <tr>
                          <td
                            className="px-4 py-6 text-center text-xs text-muted-foreground"
                            colSpan={2}
                          >
                            Nenhum custo por ação disponível.
                          </td>
                        </tr>
                      ) : (
                        costRows.map((row) => (
                          <tr
                            key={row.action}
                            className="border-b last:border-none hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 font-medium">
                              {row.action}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {row.cost}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {adsetBreakdown.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      Resultado oficial por conjunto
                    </h3>
                    {dominantGoalLabel && (
                      <span className="text-[0.7rem] text-muted-foreground">
                        {dominantGoalLabel}
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                        <tr className="border-b">
                          <th className="px-4 py-2 font-medium">Conjunto</th>
                          <th className="px-4 py-2 font-medium">Objetivo</th>
                          <th className="px-4 py-2 font-medium">Resultado</th>
                          <th className="px-4 py-2 text-right font-medium">
                            Quantidade
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            Custo/Resultado
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            Gasto
                          </th>
                          <th className="px-4 py-2 text-right font-medium">
                            CTR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {adsetBreakdown.map((adset) => {
                          const cost =
                            adset.custo_por_resultado ??
                            calcCPL(adset.spend, adset.quantidade);
                          const adsetCtr = calcCTR(
                            adset.clicks,
                            adset.impressions,
                          );
                          return (
                            <tr
                              key={adset.adset_id}
                              className="border-b last:border-none hover:bg-muted/30"
                            >
                              <td className="px-4 py-3 font-medium">
                                {adset.adset_name ?? adset.adset_id}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {getOptimizationGoalLabel(
                                  adset.optimization_goal,
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {adset.label ?? "Resultado"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {formatInteger(adset.quantidade)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {cost !== null
                                  ? formatCurrency(cost)
                                  : "N/D"}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {formatCurrency(adset.spend)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {formatPercentage(adsetCtr)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[0.7rem] leading-tight text-muted-foreground">
                    Essa tabela replica a coluna Resultado do Gerenciador de
                    Anúncios, respeitando a meta de otimização de cada conjunto.
                  </p>
                </section>
              )}

              {/* RESUMO BRUTO */}
              <section className="space-y-4">
                <Separator />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <AccountMetric
                    label="Impressões"
                    value={formatInteger(impressions)}
                  />
                  <AccountMetric
                    label="Cliques"
                    value={formatInteger(clicks)}
                  />
                  <AccountMetric label="Alcance" value={formatInteger(reach)} />
                  <AccountMetric
                    label="Gasto"
                    value={formatCurrency(spend)}
                  />
                </div>
                <p className="text-[0.7rem] leading-tight text-muted-foreground">
                  Dados fornecidos pela API de Insights da Meta Ads para a
                  campanha selecionada no período escolhido.
                </p>
              </section>
            </>
          )}

          {insightLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Carregando métricas da campanha…</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------
 * Dashboard principal
 * ------------------------------------------------------------------ */

export default function Dashboard() {
  // RANGE PRINCIPAL
  const fallbackRange = useMemo(() => createDefaultRange(), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // FILTROS
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [objectiveFilter, setObjectiveFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // CONTROLE DE UI
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // CAMPANHA ABERTA NO MODAL
  const [insightsCampaignRef, setInsightsCampaignRef] = useState<{
    account: DashboardAccountMetrics;
    campaign: DashboardCampaignMetrics;
  } | null>(null);

  // Resolver datas ativas
  const resolvedFrom: Date = (dateRange?.from ?? fallbackRange.from)!;
  const resolvedTo: Date =
    (dateRange?.to ?? fallbackRange.to ?? fallbackRange.from)!;

  // Query: contas vinculadas (resources)
  const { data: resourcesData = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  // Query: campanhas conhecidas (catálogo interno)
  const { data: campaignsData = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  // Presets de data rápidos
  const quickRanges = useMemo<QuickRange[]>(() => {
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

  // Só contas de anúncio
  const accountResources = useMemo(
    () => resourcesData.filter((resource) => resource.type === "account"),
    [resourcesData],
  );

  // Opções de conta pro combobox
  const accountOptions = useMemo<FilterOption[]>(() => {
    return accountResources
      .map((resource) => ({
        value: String(resource.id),
        label: resource.name,
        description: resource.value, // ID real da conta
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accountResources]);

  // lookup rápido accountId -> { name, value }
  const accountNameLookup = useMemo(() => {
    const map = new Map<number, { name: string; value: string }>();
    for (const resource of accountResources) {
      map.set(resource.id, { name: resource.name, value: resource.value });
    }
    return map;
  }, [accountResources]);

  // Range efetivo (o que tá aplicado de fato)
  const effectiveRange: DateRange = { from: resolvedFrom, to: resolvedTo };
  const hasCustomRange = Boolean(dateRange?.from && dateRange?.to);
  const dateRangeLabel = formatRangeLabel(effectiveRange);

  // Contagem de filtros ativos
  const hasActiveFilters = Boolean(
    accountFilter ||
    campaignFilter ||
    objectiveFilter ||
    statusFilter,
  );
  const filterCount = [
    accountFilter,
    campaignFilter,
    objectiveFilter,
    statusFilter,
  ].filter(Boolean).length;
  const filterButtonLabel =
    filterCount > 0 ? `Filtros (${filterCount})` : "Filtros";

  // reset dos filtros
  const handleResetFilters = () => {
    setAccountFilter(null);
    setCampaignFilter(null);
    setObjectiveFilter(null);
    setStatusFilter(null);
  };

  // comparar ranges
  const isRangeEqual = (a: DateRange, b: DateRange): boolean => {
    if (!a.from || !a.to || !b.from || !b.to) return false;
    return isSameDay(a.from, b.from) && isSameDay(a.to, b.to);
  };

  // aplicar range rápido
  const applyQuickRange = (range: DateRange) => {
    const fromDate: Date = range.from ?? new Date();
    const toDate: Date = (range.to ?? range.from ?? fromDate) as Date;
    setDateRange({
      from: fromDate,
      to: toDate,
    });
  };

  // se os filtros ficarem ativos pela 1ª vez, abre o bloco Collapsible
  const previousHasFiltersRef = useRef(hasActiveFilters);
  useEffect(() => {
    if (!previousHasFiltersRef.current && hasActiveFilters) {
      setFiltersOpen(true);
    }
    previousHasFiltersRef.current = hasActiveFilters;
  }, [hasActiveFilters]);

  // Montar URL da API de métricas do dashboard
  const params = new URLSearchParams({
    startDate: formatDate(resolvedFrom, "yyyy-MM-dd"),
    endDate: formatDate(resolvedTo, "yyyy-MM-dd"),
  });
  if (accountFilter) params.append("accountId", accountFilter);
  if (campaignFilter) params.append("campaignId", campaignFilter);
  if (objectiveFilter) params.append("objective", objectiveFilter);
  if (statusFilter) params.append("status", statusFilter);

  const metricsEndpoint = `/api/dashboard/metrics?${params.toString()}`;

  // Query principal do dashboard
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<DashboardMetricsResponse, Error>({
    queryKey: [metricsEndpoint],
  });

  const accounts: DashboardAccountMetrics[] = data?.accounts ?? [];

  const campaignOptions = useMemo<CampaignFilterOption[]>(() => {
    const options: CampaignFilterOption[] = [];
    const seen = new Set<string>();
    const selectedAccount = accountFilter ?? null;

    for (const account of accounts) {
      const accountIdStr = String(account.id);
      if (selectedAccount && accountIdStr !== selectedAccount) {
        continue;
      }

      for (const campaign of account.campaigns) {
        const campaignId = campaign.id;
        if (!campaignId || seen.has(campaignId)) continue;
        seen.add(campaignId);

        const objective = campaign.objective?.toUpperCase() ?? null;
        const descriptionParts: string[] = [];
        if (objective) {
          descriptionParts.push(getObjectiveLabel(objective));
        }
        descriptionParts.push(account.name);

        options.push({
          value: campaignId,
          label: campaign.name ?? `Campanha ${campaignId}`,
          description: descriptionParts.filter(Boolean).join(" - "),
          accountId: account.id,
          objective,
        });
      }
    }

    if (options.length === 0 && campaignsData.length > 0) {
      for (const campaign of campaignsData) {
        const accountId = campaign.accountId ?? null;
        if (selectedAccount && accountId !== Number(selectedAccount)) {
          continue;
        }

        const objective = campaign.objective
          ? campaign.objective.toUpperCase()
          : null;
        const accountInfo = accountId
          ? accountNameLookup.get(accountId)
          : undefined;

        const descriptionParts: string[] = [];
        if (objective) {
          descriptionParts.push(getObjectiveLabel(objective));
        }
        if (accountInfo?.name) {
          descriptionParts.push(accountInfo.name);
        }

        const idStr = String(campaign.id);
        if (seen.has(idStr)) continue;
        seen.add(idStr);

        options.push({
          value: idStr,
          label: campaign.name ?? `Campanha ${campaign.id}`,
          description: descriptionParts.filter(Boolean).join(" - "),
          accountId,
          objective,
        });
      }
    }

    return options.sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    );
  }, [accounts, accountFilter, campaignsData, accountNameLookup]);

  const campaignOptionsForCombobox = useMemo<FilterOption[]>(() => {
    return campaignOptions.map(({ value, label, description }) => ({
      value,
      label,
      description,
    }));
  }, [campaignOptions]);

  const objectiveOptions = useMemo<FilterOption[]>(() => {
    const seen = new Set<string>();
    const options: FilterOption[] = [];
    const selectedAccount = accountFilter ?? null;

    const addObjective = (raw?: string | null) => {
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
      if (selectedAccount && String(account.id) !== selectedAccount) {
        continue;
      }
      for (const campaign of account.campaigns) {
        addObjective(campaign.objective);
      }
    }

    if (options.length === 0 && campaignsData.length > 0) {
      for (const campaign of campaignsData) {
        if (
          selectedAccount &&
          campaign.accountId !== Number(selectedAccount)
        ) {
          continue;
        }
        addObjective(campaign.objective);
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accounts, campaignsData, accountFilter]);

  useEffect(() => {
    if (!campaignFilter) return;
    if (!campaignOptions.some((option) => option.value === campaignFilter)) {
      setCampaignFilter(null);
    }
  }, [campaignFilter, campaignOptions]);

  useEffect(() => {
    if (!objectiveFilter) return;
    if (!objectiveOptions.some((option) => option.value === objectiveFilter)) {
      setObjectiveFilter(null);
    }
  }, [objectiveFilter, objectiveOptions]);

  const statusOptions = useMemo<FilterOption[]>(() => {
    const seen = new Set<string>();
    const options: FilterOption[] = [];
    for (const account of accounts) {
      for (const campaign of account.campaigns) {
        const status = campaign.status ? campaign.status.toUpperCase() : null;
        if (!status || seen.has(status)) continue;
        seen.add(status);
        options.push({
          value: status,
          label: getStatusLabel(status),
        });
      }
    }
    if (options.length === 0) {
      options.push(...Object.keys(STATUS_LABELS).map((key) => ({
        value: key,
        label: getStatusLabel(key),
      })));
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accounts]);

  useEffect(() => {
    if (!statusFilter) return;
    if (!statusOptions.some((option) => option.value === statusFilter)) {
      setStatusFilter(null);
    }
  }, [statusFilter, statusOptions]);

  // chips de filtros aplicados (pra mostrar visualmente)
  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      label: string;
      value: string;
      onRemove: () => void;
    }> = [];

    if (accountFilter) {
      const account = accountOptions.find(
        (option) => option.value === accountFilter,
      );
      chips.push({
        label: "Conta",
        value: account?.label ?? `ID ${accountFilter}`,
        onRemove: () => setAccountFilter(null),
      });
    }

    if (campaignFilter) {
      const campaign = campaignOptions.find(
        (option) => option.value === campaignFilter,
      );
      chips.push({
        label: "Campanha",
        value: campaign?.label ?? `ID ${campaignFilter}`,
        onRemove: () => setCampaignFilter(null),
      });
    }

    if (objectiveFilter) {
      const objective = objectiveOptions.find(
        (option) => option.value === objectiveFilter,
      );
      chips.push({
        label: "Objetivo",
        value: objective?.label ?? getObjectiveLabel(objectiveFilter),
        onRemove: () => setObjectiveFilter(null),
      });
    }

    if (statusFilter) {
      const statusOption = statusOptions.find(
        (option) => option.value === statusFilter,
      );
      chips.push({
        label: "Status",
        value: statusOption?.label ?? getStatusLabel(statusFilter),
        onRemove: () => setStatusFilter(null),
      });
    }

    return chips;
  }, [
    accountFilter,
    accountOptions,
    campaignFilter,
    campaignOptions,
    objectiveFilter,
    objectiveOptions,
    statusFilter,
    statusOptions,
    setAccountFilter,
    setCampaignFilter,
    setObjectiveFilter,
    setStatusFilter,
  ]);

  // KPIs do topo
  const kpis: KPICardData[] = useMemo(() => {
    const totals = data?.totals ?? defaultTotals;
    const previous = data?.previousTotals ?? defaultTotals;

    // Totais atuais
    const totalSpend = totals.spend;
    const totalClicks = totals.clicks;
    const totalImpr = totals.impressions;
    const totalCTR = calcCTR(totalClicks, totalImpr);

    // Totais anteriores
    const prevSpend = previous.spend;
    const prevClicks = previous.clicks;
    const prevImpr = previous.impressions;
    const prevCTR = calcCTR(prevClicks, prevImpr);

    // "resultado principal" atual e anterior
    const derivedNow = extractResultSummary(totals);
    const derivedPrev = extractResultSummary(previous);

    const totalResultsNow = derivedNow.quantidade ?? 0;
    const totalResultsPrev = derivedPrev.quantidade ?? 0;

    const currentCpl = derivedNow.custo ?? null;
    const previousCpl = derivedPrev.custo ?? null;

    return [
      {
        title: "Total Gasto",
        value: formatCurrency(totalSpend),
        icon: DollarSign,
        trend: buildTrend(totalSpend, prevSpend),
      },
      {
        title: "Total Resultados",
        value:
          totalResultsNow !== null && totalResultsNow !== undefined
            ? formatInteger(totalResultsNow)
            : "—",
        icon: Users,
        trend: buildTrend(totalResultsNow, totalResultsPrev),
      },
      {
        title: "Custo por Resultado (médio)",
        value:
          currentCpl !== null && currentCpl !== undefined
            ? formatCurrency(currentCpl)
            : "—",
        icon: TrendingUp,
        trend: buildTrend(
          currentCpl ?? null,
          previousCpl ?? null,
          true, // custo menor é melhor
        ),
      },
      {
        title: "CTR Média",
        value: formatPercentage(totalCTR),
        icon: MousePointerClick,
        trend: buildTrend(totalCTR, prevCTR),
      },
    ];
  }, [data]);

  return (
    <>
      <div className="space-y-6 p-6">
        {/* HEADER TOPO */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* LADO ESQUERDO: título e período */}
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground">
              Visão geral das contas e campanhas Meta Ads no período
              selecionado
            </p>
            <p className="text-[0.7rem] leading-tight text-muted-foreground">
              Período aplicado:{" "}
              <span className="font-medium text-foreground">
                {dateRangeLabel}
              </span>{" "}
              {!hasCustomRange && "(padrão)"}
            </p>
          </div>

          {/* LADO DIREITO: ações rápidas */}
          <div className="flex flex-col items-start gap-3 sm:items-end">
            {isFetching && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Atualizando dados…</span>
              </span>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button data-testid="button-new-campaign">
                Nova Campanha
              </Button>

              <Button
                variant={showDebug ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDebug((s) => !s)}
                className="flex items-center gap-1"
              >
                <Bug className="h-4 w-4" />
                {showDebug ? "Esconder debug" : "Ver debug bruto"}
              </Button>
            </div>
          </div>
        </div>

        {/* BLOCO DE FILTROS */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                data-testid="button-toggle-filters"
              >
                <Filter className="h-4 w-4" />
                <span>{filterButtonLabel}</span>
                <ChevronsUpDown className="h-4 w-4 opacity-60" />
              </Button>
            </CollapsibleTrigger>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                data-testid="button-clear-filters"
              >
                Limpar filtros
              </Button>
            )}

            <div className="flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <Badge
                  key={`${chip.label}-${chip.value}`}
                  variant="secondary"
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs"
                >
                  <span className="font-semibold uppercase tracking-tight text-muted-foreground">
                    {chip.label}:
                  </span>
                  <span>{chip.value}</span>
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground focus:outline-none focus:text-foreground"
                    aria-label={`Remover filtro ${chip.label.toLowerCase()}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Período aplicado:{" "}
            <span className="font-medium text-foreground">
              {dateRangeLabel}
            </span>{" "}
            {!hasCustomRange && "(padrão)"}
          </div>

          <CollapsibleContent className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                {/* atalhos de período */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Atalhos de período
                  </span>
                  {quickRanges.map((preset) => {
                    const isActive = isRangeEqual(effectiveRange, preset.range);
                    return (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        onClick={() => applyQuickRange(preset.range)}
                        className="rounded-full"
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>

                {/* Linha de filtros detalhados */}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  {/* Período customizado */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Período
                    </span>
                    <DateRangeSelector value={dateRange} onChange={setDateRange} />
                  </div>

                  {/* Filtro Conta */}
                  <FilterCombobox
                    label="Conta de anúncio"
                    placeholder="Todas as contas"
                    emptyLabel="Nenhuma conta encontrada"
                    options={accountOptions}
                    value={accountFilter}
                    onChange={setAccountFilter}
                    testId="filter-account"
                  />

                  {/* Filtro Campanha */}
                  <FilterCombobox
                    label="Campanha"
                    placeholder="Todas as campanhas"
                    emptyLabel="Nenhuma campanha encontrada"
                    options={campaignOptionsForCombobox}
                    value={campaignFilter}
                    onChange={setCampaignFilter}
                    testId="filter-campaign"
                  />

                  {/* Filtro Objetivo */}
                  <FilterCombobox
                    label="Objetivo"
                    placeholder="Todos os objetivos"
                    emptyLabel="Nenhum objetivo encontrado"
                    options={objectiveOptions}
                    value={objectiveFilter}
                    onChange={setObjectiveFilter}
                    testId="filter-objective"
                  />

                  {/* Filtro Status */}
                  <FilterCombobox
                    label="Status da campanha"
                    placeholder="Todos os status"
                    emptyLabel="Status não encontrado"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    testId="filter-status"
                  />
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* ESTADO DE ERRO GERAL */}
        {isError ? (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
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
        ) : (
          <>
            {/* KPIs DO TOPO */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <KPICard
                  key={kpi.title}
                  title={kpi.title}
                  value={kpi.value}
                  icon={kpi.icon}
                  trend={kpi.trend}
                />
              ))}
            </div>

            {/* LOADING OU LISTA DE CONTAS */}
            {!data && isLoading ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando métricas do período selecionado…</span>
                </CardContent>
              </Card>
            ) : accounts.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Nenhum resultado encontrado para os filtros selecionados. Ajuste os filtros ou revise o período."
                    : "Nenhuma métrica encontrada para o período escolhido. Ajuste o filtro de datas ou confira se as contas possuem dados sincronizados."}
                </CardContent>
              </Card>
            ) : (
              // LOOP DAS CONTAS
              accounts.map((account) => {
                const accountSummary = extractResultSummary(
                  account.metrics,
                  // futuramente dá pra ter -ccount.resultado` se você quiser
                );

                const accountCtr = calcCTR(
                  account.metrics.clicks,
                  account.metrics.impressions,
                );

                return (
                  <Card
                    key={account.id}
                    data-testid={`card-account-${account.id}`}
                  >
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-lg font-semibold">
                        {account.name}
                      </CardTitle>
                      <p className="font-mono text-sm text-muted-foreground">
                        {account.value}
                      </p>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      {/* MÉTRICAS RESUMIDAS DA CONTA */}
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <AccountMetric
                          label="Gasto"
                          value={formatCurrency(account.metrics.spend)}
                        />
                        <AccountMetric
                          label={accountSummary.label}
                          value={
                            accountSummary.quantidade !== null
                              ? formatInteger(accountSummary.quantidade)
                              : "N/D"
                          }
                        />
                        <AccountMetric
                          label="Custo por resultado"
                          value={
                            accountSummary.custo !== null
                              ? formatCurrency(accountSummary.custo)
                              : "N/D"
                          }
                        />
                        <AccountMetric
                          label="CTR"
                          value={formatPercentage(accountCtr)}
                        />
                      </div>

                      {/* TABELA DE CAMPANHAS DESSA CONTA */}
                      {account.campaigns.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          {hasActiveFilters
                            ? "Nenhuma campanha corresponde aos filtros selecionados."
                            : "Nenhuma campanha cadastrada para esta conta no período selecionado."}
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
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                  {/* botão/ação */}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {account.campaigns.map((campaign) => {
                                const campSummary = extractResultSummary(
                                  campaign.metrics,
                                  campaign.resultado,
                                );

                                const campaignCtr = calcCTR(
                              campaign.metrics.clicks,
                              campaign.metrics.impressions,
                            );

                            const displayName =
                              campaign.name ?? `Campanha ${campaign.id}`;

                                const objectiveLabel = getObjectiveLabel(
                                  campaign.objective,
                                );

                            const statusLabel = campaign.status
                              ? campaign.status === "active"
                                ? "Ativa"
                                : campaign.status === "paused"
                                  ? "Pausada"
                                  : campaign.status
                              : null;

                            const detailRows = (() => {
                              const details = campaign.resultado?.detalhes ?? [];
                              if (details.length <= 1) {
                                return details;
                              }
                              const merged = new Map<
                                string,
                                {
                                  tipo: string;
                                  label: string;
                                  quantidade: number;
                                  custo_por_resultado: number | null;
                                }
                              >();
                              for (const detail of details) {
                                const key = detail.tipo ?? detail.label ?? "";
                                const current = merged.get(key);
                                if (current) {
                                  current.quantidade += detail.quantidade;
                                  if (
                                    current.custo_por_resultado === null &&
                                    detail.custo_por_resultado !== null
                                  ) {
                                    current.custo_por_resultado =
                                      detail.custo_por_resultado;
                                  }
                                } else {
                                  merged.set(key, { ...detail });
                                }
                              }
                              return Array.from(merged.values());
                            })();

                                return (
                                  <tr
                                    key={campaign.id}
                                    className="border-b last:border-none hover:bg-muted/30"
                                    data-testid={`row-campaign-${campaign.id}`}
                                  >
                                    <td className="px-4 py-4">
                                      <div className="flex flex-col">
                                        <span className="font-medium">
                                          {displayName}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          ID #{campaign.id}
                                        </span>
                                      </div>
                                    </td>

                                    <td className="px-4 py-4">
                                      {objectiveLabel ? (
                                        <Badge variant="outline">
                                          {objectiveLabel}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          -
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-4">
                                      {statusLabel ? (
                                        <Badge
                                          variant={
                                            campaign.status === "active"
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

                                    <td className="px-4 py-4 text-right font-mono">
                                      {formatCurrency(
                                        campaign.metrics.spend,
                                      )}
                                    </td>

                                    <td className="px-4 py-4 text-right">
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                                          {campSummary.label}
                                        </span>
                                        <span className="font-semibold text-foreground">
                                          {campSummary.quantidade !== null
                                            ? formatInteger(
                                                campSummary.quantidade,
                                              )
                                            : "N/D"}
                                        </span>
                                        {detailRows.length > 0 && (
                                          <div className="flex flex-wrap justify-end gap-2 text-[0.65rem] text-muted-foreground">
                                            {detailRows.map((detail) => (
                                              <span
                                                key={`${campaign.id}-${detail.tipo ?? detail.label}`}
                                                className="flex items-center gap-1"
                                              >
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    <td className="px-4 py-4 text-right font-mono">
                                      {campSummary.custo !== null
                                        ? formatCurrency(campSummary.custo)
                                        : "N/D"}
                                    </td>

                                    <td className="px-4 py-4 text-right font-mono">
                                      {formatPercentage(campaignCtr)}
                                    </td>

                                    <td className="px-4 py-4 text-right">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setInsightsCampaignRef({
                                            account,
                                            campaign,
                                          })
                                        }
                                      >
                                        Ver métricas
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
              })
            )}
          </>
        )}

        {/* DEBUG PANEL (opcional) */}
        {showDebug && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Bug className="h-4 w-4 text-muted-foreground" />
                Debug / Payload cru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[400px] overflow-auto rounded bg-muted p-4 text-xs leading-snug">
                {JSON.stringify(
                  {
                    request: {
                      startDate: formatDate(resolvedFrom, "yyyy-MM-dd"),
                      endDate: formatDate(resolvedTo, "yyyy-MM-dd"),
                      accountFilter,
                      campaignFilter,
                      objectiveFilter,
                    },
                    response: data ?? null,
                  },
                  null,
                  2,
                )}
              </pre>
              <p className="pt-2 text-[0.7rem] leading-tight text-muted-foreground">
                Esses dados vêm direto da API interna do dashboard, já com
                agregação por conta e campanha.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* MODAL DE INSIGHTS (campanha individual) */}
      <InsightsDialog
        open={!!insightsCampaignRef}
        onClose={() => setInsightsCampaignRef(null)}
        campaign={insightsCampaignRef?.campaign ?? null}
        account={insightsCampaignRef?.account ?? null}
        baseRange={effectiveRange}
      />
    </>
  );
}













