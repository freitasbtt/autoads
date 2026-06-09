import type { DateRange } from "react-day-picker";
import { ChevronsUpDown, Filter, Loader2, TrendingDown, TrendingUp, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type {
  ActiveFilterChip,
  DashboardKpi,
  DashboardQuickRange,
  DashboardShareMetadataResponse,
  FilterOption,
} from "../types";
import {
  DateRangePickerField,
  FilterCombobox,
  MultiFilterCombobox,
} from "./DashboardControls";

type DashboardFiltersCardProps = {
  isSharedMode: boolean;
  periodLabel: string;
  shareMetadata?: DashboardShareMetadataResponse;
  hasSelectedAccounts: boolean;
  kpis: DashboardKpi[];
  normalizedRange: DateRange;
  quickRanges: DashboardQuickRange[];
  selectedAccountIds: string[];
  campaignFilter: string | null;
  campaignSearchTerm: string;
  objectiveFilter: string | null;
  statusFilter: string | null;
  accountOptions: FilterOption[];
  campaignOptions: FilterOption[];
  objectiveOptions: FilterOption[];
  statusOptions: FilterOption[];
  activeFilterChips: ActiveFilterChip[];
  hasActiveFilters: boolean;
  hasPendingChanges: boolean;
  isApplyingFilters: boolean;
  isDataError: boolean;
  isDataReady: boolean;
  goalsButtonLabel: string;
  isGoalsLoading: boolean;
  isGoalsButtonDisabled: boolean;
  onRangeChange: (range: DateRange | null) => void;
  onApplyQuickRange: (range: DateRange) => void;
  onAccountsChange: (values: string[]) => void;
  onCampaignChange: (value: string | null) => void;
  onCampaignSearchTermChange: (value: string) => void;
  onObjectiveChange: (value: string | null) => void;
  onStatusChange: (value: string | null) => void;
  onApplyFilters: () => void;
  onOpenGoals: () => void;
  onClearAllFilters: () => void;
  sameRange: (a: DateRange, b: DateRange) => boolean;
};

export function DashboardFiltersCard({
  isSharedMode,
  periodLabel,
  shareMetadata,
  hasSelectedAccounts,
  kpis,
  normalizedRange,
  quickRanges,
  selectedAccountIds,
  campaignFilter,
  campaignSearchTerm,
  objectiveFilter,
  statusFilter,
  accountOptions,
  campaignOptions,
  objectiveOptions,
  statusOptions,
  activeFilterChips,
  hasActiveFilters,
  hasPendingChanges,
  isApplyingFilters,
  isDataError,
  isDataReady,
  goalsButtonLabel,
  isGoalsLoading,
  isGoalsButtonDisabled,
  onRangeChange,
  onApplyQuickRange,
  onAccountsChange,
  onCampaignChange,
  onCampaignSearchTermChange,
  onObjectiveChange,
  onStatusChange,
  onApplyFilters,
  onOpenGoals,
  onClearAllFilters,
  sameRange,
}: DashboardFiltersCardProps) {
  return (
    <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)]">
      <CardContent className="relative space-y-6 px-5 py-5 sm:px-6">
        {isSharedMode ? (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Periodo
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{periodLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contas
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {shareMetadata?.accounts.length ?? 0} selecionadas
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Link expira em
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {shareMetadata
                  ? new Date(shareMetadata.expiresAt).toLocaleString("pt-BR")
                  : "Carregando"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Modo
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">Somente leitura</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-slate-200 bg-slate-50/80 px-4 text-slate-700"
                  >
                    <Filter className="h-4 w-4" />
                    <span>{hasActiveFilters ? `Filtros (${activeFilterChips.length})` : "Filtros"}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-60" />
                  </Button>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearAllFilters}
                      data-testid="button-clear-filters"
                      className="rounded-full text-slate-600"
                    >
                      Limpar filtros
                    </Button>
                  )}

                  {activeFilterChips.map((chip) => (
                    <Badge
                      key={`${chip.label}-${chip.value}`}
                      variant="secondary"
                      className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1 text-[0.7rem] text-slate-700"
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

                <div className="text-[0.72rem] leading-tight text-slate-500">
                  Periodo aplicado: <span className="font-medium text-slate-950">{periodLabel}</span>
                </div>
                {hasPendingChanges && (
                  <div className="text-[0.72rem] leading-tight text-amber-600">
                    Existem alteracoes pendentes. Clique em aplicar filtros para atualizar os dados.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenGoals}
                  disabled={isGoalsButtonDisabled}
                  className="rounded-full px-5 shadow-sm"
                >
                  {isGoalsLoading ? "Carregando metas..." : goalsButtonLabel}
                </Button>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm",
                    isDataError
                      ? "border-red-200 bg-red-50 text-red-700"
                      : isApplyingFilters
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : isDataReady
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600",
                  )}
                >
                  {isApplyingFilters ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isDataError
                          ? "bg-red-500"
                          : isDataReady
                            ? "bg-emerald-500"
                            : "bg-slate-300",
                      )}
                    />
                  )}
                  {isDataError
                    ? "API com falha"
                    : isApplyingFilters
                      ? "Carregando dados"
                      : isDataReady
                        ? "API funcionando"
                        : "Aguardando filtros"}
                </div>
                <Button
                  size="sm"
                  onClick={onApplyFilters}
                  disabled={isApplyingFilters || !hasPendingChanges}
                  className="rounded-full px-5 shadow-sm"
                >
                  {isApplyingFilters ? "Carregando..." : "Aplicar filtros"}
                </Button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-4 sm:p-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Atalhos de periodo
                  </span>

                  {quickRanges.map((preset) => {
                    const isOn = sameRange(normalizedRange, preset.range);
                    return (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={isOn ? "default" : "outline"}
                        onClick={() => onApplyQuickRange(preset.range)}
                        className="rounded-full text-xs shadow-sm"
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
                  <div className="xl:col-span-2">
                    <DateRangePickerField value={normalizedRange} onChange={onRangeChange} />
                  </div>

                  <MultiFilterCombobox
                    label="Conta de anuncio"
                    placeholder="Selecione uma ou mais contas"
                    emptyLabel="Nenhuma conta encontrada"
                    options={accountOptions}
                    values={selectedAccountIds}
                    onChange={onAccountsChange}
                    testId="filter-account"
                    className="xl:col-span-1"
                  />

                  <FilterCombobox
                    label="Campanha"
                    placeholder="Todas as campanhas"
                    emptyLabel="Nenhuma campanha encontrada"
                    options={campaignOptions}
                    value={campaignFilter}
                    onChange={onCampaignChange}
                    testId="filter-campaign"
                    className="xl:col-span-1"
                  />

                  <div className="flex w-full flex-col gap-1 xl:col-span-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Nome da campanha
                    </span>
                    <Input
                      value={campaignSearchTerm}
                      onChange={(event) => onCampaignSearchTermChange(event.target.value)}
                      placeholder="Contem..."
                      data-testid="filter-campaign-search"
                      className="w-full"
                    />
                  </div>

                  <FilterCombobox
                    label="Objetivo"
                    placeholder="Todos os objetivos"
                    emptyLabel="Nenhum objetivo encontrado"
                    options={objectiveOptions}
                    value={objectiveFilter}
                    onChange={onObjectiveChange}
                    testId="filter-objective"
                    className="xl:col-span-1"
                  />

                  <FilterCombobox
                    label="Status da campanha"
                    placeholder="Todos os status"
                    emptyLabel="Status nao encontrado"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={onStatusChange}
                    testId="filter-status"
                    className="xl:col-span-1"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {hasSelectedAccounts && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {kpis.map((kpi) => (
              <div
                key={kpi.title}
                className="relative flex flex-col rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]"
              >
                <div className="absolute right-4 top-4 text-slate-400">
                  <kpi.icon className="h-4 w-4" />
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {kpi.title}
                </div>
                <div className="mt-3 text-[1.8rem] font-semibold leading-none tracking-tight text-slate-950">
                  {kpi.value}
                </div>

                {kpi.trend && (
                  <div
                    className={cn(
                      "mt-3 flex items-center gap-1 text-xs font-medium",
                      kpi.trend.positive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {kpi.trend.positive ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    <span>{kpi.trend.value}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
