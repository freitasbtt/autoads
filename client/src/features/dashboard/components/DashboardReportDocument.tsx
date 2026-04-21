import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type {
  ActiveFilterChip,
  DashboardAccountMetrics,
  DashboardCampaignIndexEntry,
  DashboardKpi,
  DashboardMetricsResponse,
  DashboardSpendByAccountDatum,
  DashboardTimelinePoint,
  DashboardTopCreativesAccountGroup,
} from "../types";
import { DashboardCampaignsView } from "./DashboardCampaignsView";
import { DashboardMacroView } from "./DashboardMacroView";

type DashboardReportDocumentProps = {
  periodLabel: string;
  generatedAtLabel: string;
  hasSelectedAccounts: boolean;
  hasActiveFilters: boolean;
  activeFilterChips: ActiveFilterChip[];
  selectedAccountIds: string[];
  accounts: DashboardAccountMetrics[];
  kpis: DashboardKpi[];
  metricsData?: DashboardMetricsResponse;
  timelineData: DashboardTimelinePoint[];
  funnelSteps: {
    order: number;
    label: string;
    value: number;
    fill: string;
    width: string;
  }[];
  leadsByAccountData: Array<{
    name: string;
    shortName: string;
    leads: number;
    spend: number;
  }>;
  spendByAccountData: DashboardSpendByAccountDatum[];
  topCreativesByAccount: DashboardTopCreativesAccountGroup[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isTopCreativesLoading: boolean;
  isTopCreativesFetching: boolean;
  isTopCreativesError: boolean;
  topCreativesError: Error | null;
  campaignIndex: Map<string, DashboardCampaignIndexEntry>;
};

export function DashboardReportDocument({
  periodLabel,
  generatedAtLabel,
  hasSelectedAccounts,
  hasActiveFilters,
  activeFilterChips,
  selectedAccountIds,
  accounts,
  kpis,
  metricsData,
  timelineData,
  funnelSteps,
  leadsByAccountData,
  spendByAccountData,
  topCreativesByAccount,
  isLoading,
  isError,
  error,
  isTopCreativesLoading,
  isTopCreativesFetching,
  isTopCreativesError,
  topCreativesError,
  campaignIndex,
}: DashboardReportDocumentProps) {
  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-6 bg-white">
      <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-6 py-6 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)]">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Relatorio do Dashboard
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Consolidado executivo com indicadores principais, visao macro, graficos e
            desempenho das campanhas no periodo selecionado.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Periodo: <span className="font-semibold text-slate-950">{periodLabel}</span>
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Gerado em: <span className="font-semibold text-slate-950">{generatedAtLabel}</span>
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Contas:{" "}
              <span className="font-semibold text-slate-950">
                {selectedAccountIds.length > 0 ? selectedAccountIds.length : accounts.length}
              </span>
            </span>
          </div>
        </div>
      </div>

      <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-950">
            Informacoes gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Periodo
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{periodLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Contas selecionadas
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {selectedAccountIds.length > 0 ? selectedAccountIds.length : accounts.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Filtros ativos
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {hasActiveFilters ? activeFilterChips.length : 0}
              </div>
            </div>
          </div>

          {hasActiveFilters && activeFilterChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <div
                  key={`report-${chip.label}-${chip.value}`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700"
                >
                  <span className="font-semibold">{chip.label}:</span> {chip.value}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {kpis.map((kpi) => (
              <div
                key={`report-kpi-${kpi.title}`}
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
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          Visao macro
        </div>
        <DashboardMacroView
          isSharedMode={true}
          reportMode
          hasSelectedAccounts={hasSelectedAccounts}
          isLoading={isLoading}
          isError={isError}
          error={error}
          metricsData={metricsData}
          accounts={accounts}
          timelineData={timelineData}
          funnelSteps={funnelSteps}
          leadsByAccountData={leadsByAccountData}
          spendByAccountData={spendByAccountData}
          onRetry={() => {}}
        />
      </div>

      <div className="space-y-4 break-before-page">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          Campanhas e criativos
        </div>
        <DashboardCampaignsView
          isSharedMode={true}
          reportMode
          hasSelectedAccounts={hasSelectedAccounts}
          isLoading={isLoading}
          isError={isError}
          error={error}
          metricsData={metricsData}
          accounts={accounts}
          hasActiveFilters={hasActiveFilters}
          onRetryMetrics={() => {}}
          onOpenCampaignCreatives={() => {}}
          campaignIndex={campaignIndex}
          topCreativesByAccount={topCreativesByAccount}
          isTopCreativesLoading={isTopCreativesLoading}
          isTopCreativesFetching={isTopCreativesFetching}
          isTopCreativesError={isTopCreativesError}
          topCreativesError={topCreativesError}
          onRetryTopCreatives={() => {}}
        />
      </div>
    </div>
  );
}
