import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { endOfMonth, format as formatDate, isSameDay, startOfMonth, subDays } from "date-fns";
import {
  CalendarIcon,
  ChevronsUpDown,
  Check,
  Filter,
  DollarSign,
  MousePointerClick,
  TrendingUp,
  Users,
} from "lucide-react";

import KPICard from "@/components/KPICard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

type MetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

type DashboardCampaignMetrics = {
  id: number;
  name: string | null;
  objective: string | null;
  status: string | null;
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
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
  };
  totals: MetricTotals;
  previousTotals: MetricTotals;
  accounts: DashboardAccountMetrics[];
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

const defaultTotals: MetricTotals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
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
  LEAD: "Geracao de Leads",
  TRAFFIC: "Trafego",
  CONVERSIONS: "Conversoes",
  REACH: "Alcance",
  WHATSAPP: "WhatsApp",
  SALES: "Vendas",
};

function getObjectiveLabel(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const upper = value.toUpperCase();
  return OBJECTIVE_LABELS[upper] ?? upper;
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
  const start = subDays(end, 29);
  return { from: start, to: end };
}

function formatRangeLabel(range: DateRange): string {
  if (!range.from || !range.to) {
    return "Selecione um periodo";
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

function AccountMetric({ label, value }: AccountMetricProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const displayLabel =
    value && value.from && value.to ? formatRangeLabel(value) : "Selecione um periodo";

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
              {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
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
                    className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")}
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
                        value === option.value ? "opacity-100" : "opacity-0"
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

export default function Dashboard() {
  const fallbackRange = useMemo(() => createDefaultRange(), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [objectiveFilter, setObjectiveFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const resolvedFrom: Date = (dateRange?.from ?? fallbackRange.from)!;
  const resolvedTo: Date = (dateRange?.to ?? fallbackRange.to ?? fallbackRange.from)!;

  const { data: resourcesData = [] } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const { data: campaignsData = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const quickRanges = useMemo<QuickRange[]>(() => {
    const now = new Date();
    return [
      {
        label: "Ultimos 7 dias",
        range: {
          from: subDays(now, 6),
          to: now,
        },
      },
      {
        label: "Ultimos 30 dias",
        range: {
          from: subDays(now, 29),
          to: now,
        },
      },
      {
        label: "Este mes",
        range: {
          from: startOfMonth(now),
          to: endOfMonth(now),
        },
      },
    ];
  }, []);

  const accountResources = useMemo(
    () => resourcesData.filter((resource) => resource.type === "account"),
    [resourcesData],
  );

  const accountOptions = useMemo<FilterOption[]>(() => {
    return accountResources
      .map((resource) => ({
        value: String(resource.id),
        label: resource.name,
        description: resource.value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [accountResources]);

  const accountNameLookup = useMemo(() => {
    const map = new Map<number, { name: string; value: string }>();
    for (const resource of accountResources) {
      map.set(resource.id, { name: resource.name, value: resource.value });
    }
    return map;
  }, [accountResources]);

  const campaignOptionsBase = useMemo<CampaignFilterOption[]>(() => {
    return campaignsData
      .map((campaign) => {
        const objective = campaign.objective ? campaign.objective.toUpperCase() : null;
        const accountId = campaign.accountId ?? null;
        const accountInfo = accountId ? accountNameLookup.get(accountId) : undefined;
        const descriptionParts: string[] = [`#${campaign.id}`];
        if (objective) {
          descriptionParts.push(getObjectiveLabel(objective));
        }
        if (accountInfo?.name) {
          descriptionParts.push(accountInfo.name);
        }

        return {
          value: String(campaign.id),
          label: campaign.name ?? `Campanha ${campaign.id}`,
          description: descriptionParts.join(" • "),
          accountId,
          objective,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [campaignsData, accountNameLookup]);

  const campaignOptions = useMemo<CampaignFilterOption[]>(() => {
    if (accountFilter) {
      const accountId = Number.parseInt(accountFilter, 10);
      if (Number.isFinite(accountId)) {
        return campaignOptionsBase.filter((option) => option.accountId === accountId);
      }
    }
    return campaignOptionsBase;
  }, [accountFilter, campaignOptionsBase]);

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
    for (const campaign of campaignsData) {
      if (!campaign.objective) {
        continue;
      }
      const key = campaign.objective.toUpperCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push({
        value: key,
        label: getObjectiveLabel(key),
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [campaignsData]);

  useEffect(() => {
    if (!campaignFilter) {
      return;
    }
    if (!campaignOptions.some((option) => option.value === campaignFilter)) {
      setCampaignFilter(null);
    }
  }, [campaignFilter, campaignOptions]);

  useEffect(() => {
    if (!objectiveFilter) {
      return;
    }
    if (!objectiveOptions.some((option) => option.value === objectiveFilter)) {
      setObjectiveFilter(null);
    }
  }, [objectiveFilter, objectiveOptions]);

  const effectiveRange: DateRange = { from: resolvedFrom, to: resolvedTo };
  const hasCustomRange = Boolean(dateRange && dateRange.from && dateRange.to);
  const dateRangeLabel = formatRangeLabel(effectiveRange);

  const hasActiveFilters = Boolean(accountFilter || campaignFilter || objectiveFilter);
  const filterCount = [accountFilter, campaignFilter, objectiveFilter].filter(Boolean).length;
  const filterButtonLabel = filterCount > 0 ? `Filtros (${filterCount})` : "Filtros";

  const handleResetFilters = () => {
    setAccountFilter(null);
    setCampaignFilter(null);
    setObjectiveFilter(null);
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ label: string; value: string }> = [];

    if (accountFilter) {
      const account = accountOptions.find((option) => option.value === accountFilter);
      chips.push({
        label: "Conta",
        value: account?.label ?? `ID ${accountFilter}`,
      });
    }

    if (campaignFilter) {
      const campaign = campaignOptionsBase.find((option) => option.value === campaignFilter);
      chips.push({
        label: "Campanha",
        value: campaign?.label ?? `ID ${campaignFilter}`,
      });
    }

    if (objectiveFilter) {
      const objective = objectiveOptions.find((option) => option.value === objectiveFilter);
      chips.push({
        label: "Objetivo",
        value: objective?.label ?? getObjectiveLabel(objectiveFilter),
      });
    }

    return chips;
  }, [
    accountFilter,
    accountOptions,
    campaignFilter,
    campaignOptionsBase,
    dateRangeLabel,
    objectiveFilter,
    objectiveOptions,
  ]);

  const isRangeEqual = (a: DateRange, b: DateRange): boolean => {
    if (!a.from || !a.to || !b.from || !b.to) {
      return false;
    }
    return isSameDay(a.from, b.from) && isSameDay(a.to, b.to);
  };

  const applyQuickRange = (range: DateRange) => {
    const fromDate: Date = range.from ?? new Date();
    const toDate: Date = (range.to ?? range.from ?? fromDate) as Date;
    setDateRange({
      from: fromDate,
      to: toDate,
    });
  };

  const previousHasFiltersRef = useRef(hasActiveFilters);
  useEffect(() => {
    if (!previousHasFiltersRef.current && hasActiveFilters) {
      setFiltersOpen(true);
    }
    previousHasFiltersRef.current = hasActiveFilters;
  }, [hasActiveFilters]);

  const params = new URLSearchParams({
    startDate: formatDate(resolvedFrom, "yyyy-MM-dd"),
    endDate: formatDate(resolvedTo, "yyyy-MM-dd"),
  });

  if (accountFilter) {
    params.append("accountId", accountFilter);
  }

  if (campaignFilter) {
    params.append("campaignId", campaignFilter);
  }

  if (objectiveFilter) {
    params.append("objective", objectiveFilter);
  }

  const metricsEndpoint = `/api/dashboard/metrics?${params.toString()}`;

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

  const accounts = data?.accounts ?? [];

  const kpis: KPICardData[] = useMemo(() => {
    const totals = data?.totals ?? defaultTotals;
    const previous = data?.previousTotals ?? defaultTotals;

    const totalSpend = totals.spend;
    const previousSpend = previous.spend;

    const totalLeads = totals.leads;
    const previousLeads = previous.leads;

    const currentCpl = totalLeads > 0 ? totalSpend / totalLeads : null;
    const previousCpl = previousLeads > 0 ? previous.spend / previousLeads : null;

    const currentCtr =
      totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
    const previousCtr =
      previous.impressions > 0 ? (previous.clicks / previous.impressions) * 100 : null;

    return [
      {
        title: "Total Gasto",
        value: formatCurrency(totalSpend),
        icon: DollarSign,
        trend: buildTrend(totalSpend, previousSpend),
      },
      {
        title: "Total Leads",
        value: formatInteger(totalLeads),
        icon: Users,
        trend: buildTrend(totalLeads, previousLeads),
      },
      {
        title: "CPL Medio",
        value: currentCpl !== null ? formatCurrency(currentCpl) : "—",
        icon: TrendingUp,
        trend: buildTrend(currentCpl, previousCpl, true),
      },
      {
        title: "CTR Medio",
        value: formatPercentage(currentCtr),
        icon: MousePointerClick,
        trend: buildTrend(currentCtr, previousCtr),
      },
    ];
  }, [data]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visao geral das contas e campanhas Meta Ads no periodo selecionado
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && (
            <span className="text-xs text-muted-foreground">Atualizando dados...</span>
          )}
          <Button data-testid="button-new-campaign">Nova Campanha</Button>
        </div>
      </div>

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
              </Badge>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Periodo aplicado:{" "}
          <span className="font-medium text-foreground">{dateRangeLabel}</span>
          {!hasCustomRange && " (padrao)"}
        </div>
        <CollapsibleContent className="mt-4 space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Atalhos de periodo
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Periodo
                  </span>
                  <DateRangeSelector value={dateRange} onChange={setDateRange} />
                </div>
                <FilterCombobox
                  label="Conta de anuncio"
                  placeholder="Todas as contas"
                  emptyLabel="Nenhuma conta encontrada"
                  options={accountOptions}
                  value={accountFilter}
                  onChange={setAccountFilter}
                  testId="filter-account"
                />
                <FilterCombobox
                  label="Campanha"
                  placeholder="Todas as campanhas"
                  emptyLabel="Nenhuma campanha encontrada"
                  options={campaignOptionsForCombobox}
                  value={campaignFilter}
                  onChange={setCampaignFilter}
                  testId="filter-campaign"
                />
                <FilterCombobox
                  label="Objetivo"
                  placeholder="Todos os objetivos"
                  emptyLabel="Nenhum objetivo encontrado"
                  options={objectiveOptions}
                  value={objectiveFilter}
                  onChange={setObjectiveFilter}
                  testId="filter-objective"
                />
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Falha ao carregar metricas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "Ocorreu um erro inesperado ao buscar os dados."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <KPICard key={kpi.title} title={kpi.title} value={kpi.value} icon={kpi.icon} trend={kpi.trend} />
            ))}
          </div>

          {!data && isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Carregando metricas do periodo selecionado...
              </CardContent>
            </Card>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Nenhum resultado encontrado para os filtros selecionados. Ajuste os filtros ou revise o periodo."
                  : "Nenhuma metrica encontrada para o periodo escolhido. Ajuste o filtro de datas ou confira se as contas possuem dados sincronizados."}
              </CardContent>
            </Card>
          ) : (
            accounts.map((account) => {
              const accountCpl =
                account.metrics.leads > 0
                  ? account.metrics.spend / account.metrics.leads
                  : null;
              const accountCtr =
                account.metrics.impressions > 0
                  ? (account.metrics.clicks / account.metrics.impressions) * 100
                  : null;

              return (
                <Card key={account.id} data-testid={`card-account-${account.id}`}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-lg font-semibold">{account.name}</CardTitle>
                    <p className="font-mono text-sm text-muted-foreground">{account.value}</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <AccountMetric
                        label="Gasto"
                        value={formatCurrency(account.metrics.spend)}
                      />
                      <AccountMetric
                        label="Leads"
                        value={formatInteger(account.metrics.leads)}
                      />
                      <AccountMetric label="CTR" value={formatPercentage(accountCtr)} />
                      <AccountMetric
                        label="CPL"
                        value={accountCpl !== null ? formatCurrency(accountCpl) : "—"}
                      />
                    </div>

                    {account.campaigns.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {hasActiveFilters
                          ? "Nenhuma campanha corresponde aos filtros selecionados."
                          : "Nenhuma campanha cadastrada para esta conta no periodo selecionado."}
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
                                Leads
                              </th>
                              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                CTR
                              </th>
                              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                CPL
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {account.campaigns.map((campaign) => {
                              const campaignCpl =
                                campaign.metrics.leads > 0
                                  ? campaign.metrics.spend / campaign.metrics.leads
                                  : null;
                              const campaignCtr =
                                campaign.metrics.impressions > 0
                                  ? (campaign.metrics.clicks / campaign.metrics.impressions) * 100
                                  : null;
                              const displayName = campaign.name ?? `Campanha ${campaign.id}`;
                              const objectiveLabel = getObjectiveLabel(campaign.objective);
                              const statusLabel = campaign.status
                                ? campaign.status === "active"
                                  ? "Ativa"
                                  : campaign.status === "paused"
                                  ? "Pausada"
                                  : campaign.status
                                : null;

                              return (
                                <tr
                                  key={campaign.id}
                                  className="border-b last:border-none hover:bg-muted/30"
                                  data-testid={`row-campaign-${campaign.id}`}
                                >
                                  <td className="px-4 py-4">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{displayName}</span>
                                      <span className="text-xs text-muted-foreground">ID #{campaign.id}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4">
                                    {objectiveLabel ? (
                                      <Badge variant="outline">{objectiveLabel}</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    {statusLabel ? (
                                      <Badge
                                        variant={
                                          campaign.status === "active" ? "default" : "secondary"
                                        }
                                      >
                                        {statusLabel}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono">
                                    {formatCurrency(campaign.metrics.spend)}
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    {formatInteger(campaign.metrics.leads)}
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono">
                                    {formatPercentage(campaignCtr)}
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono">
                                    {campaignCpl !== null ? formatCurrency(campaignCpl) : "—"}
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
    </div>
  );
}
