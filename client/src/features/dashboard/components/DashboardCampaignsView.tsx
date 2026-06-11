import { format as formatDate, parseISO } from "date-fns";
import {
  BarChart3,
  CircleDashed,
  Loader2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type {
  DashboardAccountMetrics,
  DashboardCampaignIndexEntry,
  DashboardCampaignMetrics,
  DashboardMetricsResponse,
  DashboardTopCreativesAccountGroup,
} from "../types";
import {
  formatCurrency,
  formatFrequency,
  formatInteger,
  formatPercent,
  calcTrend,
  getCPM,
  getCTR,
  getCostPerLead,
  getObjectiveLabel,
  getStatusLabel,
  summarizeResult,
} from "../utils";
import { AwaitingFilterCard } from "./DashboardControls";

type DashboardCampaignsViewProps = {
  isSharedMode: boolean;
  reportMode?: boolean;
  hasSelectedAccounts: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  metricsData?: DashboardMetricsResponse;
  accounts: DashboardAccountMetrics[];
  hasActiveFilters: boolean;
  onRetryMetrics: () => void;
  onOpenCampaignCreatives: (
    campaign: DashboardCampaignMetrics,
    accountValue: string,
  ) => void;
  campaignIndex: Map<string, DashboardCampaignIndexEntry>;
  topCreativesByAccount: DashboardTopCreativesAccountGroup[];
  isTopCreativesLoading: boolean;
  isTopCreativesFetching: boolean;
  isTopCreativesError: boolean;
  topCreativesError: Error | null;
  onRetryTopCreatives: () => void;
};

export function DashboardCampaignsView({
  isSharedMode,
  reportMode = false,
  hasSelectedAccounts,
  isLoading,
  isError,
  error,
  metricsData,
  accounts,
  hasActiveFilters,
  onRetryMetrics,
  onOpenCampaignCreatives,
  campaignIndex,
  topCreativesByAccount,
  isTopCreativesLoading,
  isTopCreativesFetching,
  isTopCreativesError,
  topCreativesError,
  onRetryTopCreatives,
}: DashboardCampaignsViewProps) {
  const panelClass =
    "overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/94 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.4)]";
  const topCreativesByAccountMap = new Map(
    topCreativesByAccount.map((group) => [group.accountId, group] as const),
  );

  if (!hasSelectedAccounts) {
    return <AwaitingFilterCard isSharedMode={isSharedMode} />;
  }

  const renderAccountsTable = () => {
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
        <Card className="rounded-[28px] border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <BarChart3 className="h-4 w-4" />
              Falha ao carregar métricas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "Ocorreu um erro inesperado ao buscar os dados."}
            </p>
            <Button variant="outline" onClick={onRetryMetrics}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (!metricsData || accounts.length === 0) {
      return (
        <Card className={panelClass}>
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
          const costPerLead = getCostPerLead(account.metrics.spend, account.metrics.leads);
          const previousCostPerLead = account.previousMetrics
            ? getCostPerLead(account.previousMetrics.spend, account.previousMetrics.leads)
            : null;
          const currentCpm = getCPM(account.metrics.spend, account.metrics.impressions);
          const previousCpm = account.previousMetrics
            ? getCPM(account.previousMetrics.spend, account.previousMetrics.impressions)
            : null;
          const campaignsWithDelivery = account.campaigns.filter((campaign) => campaign.metrics.spend > 0);
          const creativeGroup = topCreativesByAccountMap.get(account.id);
          const accountTimelineData = (account.timeline ?? []).map((point) => ({
            ...point,
            label: formatDate(parseISO(point.date), "dd/MM"),
          }));

          return (
            <Card
              key={account.id}
              data-testid={`card-account-${account.id}`}
              className={panelClass}
            >
              <CardHeader className="space-y-2 border-b border-slate-100/80 pb-5">
                <CardTitle className="text-lg font-semibold leading-tight text-slate-950">
                  {account.name}
                </CardTitle>
                <p className="font-mono text-sm leading-tight text-muted-foreground">{account.value}</p>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/96 shadow-[0_22px_48px_-42px_rgba(15,23,42,0.22)]">
                  <div className="flex flex-col gap-2 border-b border-slate-200/80 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Resumo da conta
                      </p>
                      <h3 className="text-sm font-semibold text-slate-950">
                        Principais indicadores do período
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Volume, eficiência e entregabilidade da conta no recorte selecionado.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                        {formatInteger(campaignsWithDelivery.length)} campanhas com veiculação
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-5">
                    <AccountKpiCard
                      label="Total Gasto"
                      value={formatCurrency(account.metrics.spend)}
                      trend={calcTrend(account.metrics.spend, account.previousMetrics?.spend ?? null)}
                      icon={Wallet}
                    />
                    <AccountKpiCard
                      label="CPM"
                      value={currentCpm !== null ? formatCurrency(currentCpm) : "N/D"}
                      trend={calcTrend(currentCpm, previousCpm, true)}
                      icon={BarChart3}
                    />
                    <AccountKpiCard
                      label="Contas Alcancadas"
                      value={formatInteger(account.metrics.reach)}
                      trend={calcTrend(account.metrics.reach, account.previousMetrics?.reach ?? null)}
                      icon={Users}
                    />
                    <AccountKpiCard
                      label="Leads"
                      value={formatInteger(account.metrics.leads)}
                      trend={calcTrend(account.metrics.leads, account.previousMetrics?.leads ?? null)}
                      icon={Target}
                    />
                    <AccountKpiCard
                      label="Custo por Lead"
                      value={costPerLead !== null ? formatCurrency(costPerLead) : "N/D"}
                      trend={calcTrend(costPerLead, previousCostPerLead, true)}
                      icon={TrendingUp}
                    />
                  </div>
                </div>

                {account.goal ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <GoalGaugeCard
                      label="Investimento"
                      value={`${formatCurrency(account.metrics.spend)} / ${formatCurrency(account.goal.targetSpend)}`}
                      progress={account.goal.spendProgress}
                      progressLabel={
                        account.goal.spendProgress !== null
                          ? `${account.goal.spendProgress.toFixed(1)}% da verba`
                          : undefined
                      }
                      helper={
                        account.goal.remainingSpend !== null
                          ? `${formatCurrency(account.goal.remainingSpend)} restantes`
                          : undefined
                      }
                      positive={account.goal.spendProgress !== null ? account.goal.spendProgress <= 100 : undefined}
                      variant="investment"
                    />
                    <GoalGaugeCard
                      label="Leads"
                      value={`${formatInteger(account.metrics.leads)} / ${formatInteger(account.goal.targetLeads)}`}
                      progress={account.goal.leadsProgress}
                      progressLabel={
                        account.goal.leadsProgress !== null
                          ? `${account.goal.leadsProgress.toFixed(1)}% da meta`
                          : undefined
                      }
                      helper={
                        account.goal.remainingLeads !== null
                          ? `${formatInteger(account.goal.remainingLeads)} restantes`
                          : undefined
                      }
                      positive={account.goal.leadsProgress !== null ? account.goal.leadsProgress >= 100 : undefined}
                      variant="leads"
                    />
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/65 p-5 text-sm text-slate-600">
                    <div className="flex items-center gap-2 font-medium text-slate-700">
                      <CircleDashed className="h-4 w-4" />
                      Sem meta cadastrada para esta conta no periodo selecionado.
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Cadastre metas no topo do dashboard para acompanhar investimento, leads, CPL e atingimento.
                    </p>
                  </div>
                )}

                <AccountTimelineChart
                  data={accountTimelineData}
                  accountKey={String(account.id)}
                  dailyGoalLeads={account.goal?.dailyLeadTarget ?? null}
                  reportMode={reportMode}
                />

                {campaignsWithDelivery.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {hasActiveFilters
                      ? "Nenhuma campanha corresponde aos filtros."
                      : "Nenhuma campanha encontrada para essa conta no período."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {formatInteger(campaignsWithDelivery.length)} com veiculacao
                      </Badge>
                    </div>

                    <div
                      className={
                        reportMode
                          ? "overflow-visible rounded-2xl border border-slate-200/80 bg-white/80"
                          : "max-h-[360px] overflow-auto rounded-2xl border border-slate-200/80 bg-white/80 print:max-h-none print:overflow-visible"
                      }
                    >
                      <table className="w-full text-sm">
                        <thead
                          className={
                            reportMode
                              ? "bg-slate-50/95"
                              : "sticky top-0 bg-slate-50/95 backdrop-blur print:static"
                          }
                        >
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
                          {campaignsWithDelivery.map((campaign) => {
                            const result = summarizeResult(campaign.metrics, campaign.resultado);
                            const ctr = getCTR(campaign.metrics.clicks, campaign.metrics.impressions);
                            const displayName = campaign.name ?? `Campanha ${campaign.id}`;
                            const objectiveLabel = getObjectiveLabel(campaign.objective);
                            const rawStatus = campaign.status ?? "";
                            const statusLabel = rawStatus ? getStatusLabel(rawStatus) : null;
                            const isActive = rawStatus.toLowerCase() === "active";

                            return (
                              <tr
                                key={campaign.id}
                                className="border-b border-slate-100 last:border-none hover:bg-slate-50/70 print:break-inside-avoid"
                              >
                                <td className="px-4 py-4 align-top">
                                  <div className="flex flex-col">
                                    <span className="font-medium leading-tight">{displayName}</span>
                                    <span className="text-xs leading-tight text-muted-foreground">
                                      ID #{campaign.id}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  {objectiveLabel ? (
                                    <Badge variant="outline">{objectiveLabel}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 align-top">
                                  {statusLabel ? (
                                    <Badge
                                      variant={isActive ? "outline" : "secondary"}
                                      className={
                                        isActive
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : undefined
                                      }
                                    >
                                      {statusLabel}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-right font-mono align-top">
                                  {formatCurrency(campaign.metrics.spend)}
                                </td>
                                <td className="px-4 py-4 text-right align-top">
                                  <div className="flex flex-col items-end">
                                    <span className="text-[0.7rem] uppercase tracking-wide leading-tight text-muted-foreground">
                                      {result.label}
                                    </span>
                                    <span className="font-semibold leading-tight text-foreground">
                                      {result.quantidade !== null ? formatInteger(result.quantidade) : "N/D"}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right font-mono align-top">
                                  {result.custo !== null ? formatCurrency(result.custo) : "N/D"}
                                </td>
                                <td className="px-4 py-4 text-right font-mono align-top">
                                  {formatPercent(ctr)}
                                </td>
                                <td className="px-4 py-4 text-right align-top">
                                  {!isSharedMode && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        onOpenCampaignCreatives(campaign, account.value)
                                      }
                                    >
                                      Ver criativos
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-4 border-t border-slate-100/80 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        Top 5 criativos desta conta
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Criativos com melhor resultado no periodo selecionado.
                      </p>
                    </div>
                    {isTopCreativesFetching && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Atualizando...
                      </span>
                    )}
                  </div>

                  {isTopCreativesLoading && topCreativesByAccount.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Carregando criativos...</span>
                      </div>
                    </div>
                  ) : isTopCreativesError ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="text-sm text-muted-foreground">
                        {topCreativesError?.message ?? "Nao foi possivel carregar os criativos."}
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={onRetryTopCreatives}>
                        Tentar novamente
                      </Button>
                    </div>
                  ) : !creativeGroup || creativeGroup.creatives.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      Nenhum criativo com resultado para esta conta no periodo.
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-5 print:grid-cols-2">
                      {creativeGroup.creatives.map((creative) => {
                        const indexed = campaignIndex.get(
                          `${creative.accountValue}:${creative.campaignId}`,
                        );

                        return (
                          <div
                            key={`${creative.campaignId}-${creative.ad_id}`}
                            className="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/96 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.32)] print:break-inside-avoid"
                          >
                            <span
                              className={cn(
                                "absolute right-3 top-3 z-10 h-2.5 w-2.5 rounded-full border border-white shadow-sm",
                                creative.ad_status?.toLowerCase() === "active"
                                  ? "bg-emerald-500"
                                  : "bg-slate-300",
                              )}
                              title={
                                creative.ad_status?.toLowerCase() === "active"
                                  ? "Ativo"
                                  : "Pausado"
                              }
                            />
                            <div className="flex items-center justify-center border-b border-slate-100 bg-slate-50/70 p-3">
                              <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                                {creative.thumbnailUrl ? (
                                  <img
                                    src={creative.thumbnailUrl}
                                    alt={creative.ad_name ?? "Criativo"}
                                    className="h-full w-full object-contain"
                                    loading={isSharedMode ? "eager" : "lazy"}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sem miniatura</span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-1 flex-col gap-3 p-4">
                              <div className="space-y-1">
                                <p className="line-clamp-2 text-sm font-semibold leading-tight">
                                  {creative.ad_name ?? "Criativo sem nome"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {creative.campaignName ?? `Campanha ${creative.campaignId}`}
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {creative.resultLabel}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">
                                    {formatInteger(creative.metrics.resultQty)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Custo / resultado
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">
                                    {formatCurrency(creative.metrics.costPerResult)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Frequencia
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">
                                    {formatFrequency(creative.metrics.frequency)}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2.5 py-2.5">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Gasto
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">
                                    {formatCurrency(creative.metrics.spend)}
                                  </div>
                                </div>
                              </div>

                              {indexed && !isSharedMode && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-auto"
                                  onClick={() =>
                                    onOpenCampaignCreatives(indexed.campaign, indexed.accountValue)
                                  }
                                >
                                  Ver criativos da campanha
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-8">{renderAccountsTable()}</div>
  );
}

function AccountKpiCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  icon: typeof Target;
}) {
  return (
    <div className="relative flex min-h-[118px] flex-col rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
      <div className="absolute right-4 top-4 text-slate-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 pr-7 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {trend ? (
        <div
          className={cn(
            "mt-auto flex items-center gap-1 text-xs font-medium",
            trend.positive ? "text-emerald-600" : "text-red-600",
          )}
        >
          {trend.positive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          <span>{trend.value}</span>
        </div>
      ) : null}
    </div>
  );
}

function GoalGaugeCard({
  label,
  value,
  progress,
  progressLabel,
  helper,
  positive,
  variant,
}: {
  label: string;
  value: string;
  progress: number | null;
  progressLabel?: string;
  helper?: string;
  positive?: boolean;
  variant: "investment" | "leads";
}) {
  const normalizedProgress = progress !== null ? Math.max(0, Math.min(progress, 100)) : 0;
  const progressText = progress !== null ? `${progress.toFixed(1)}%` : "N/D";
  const strokeColor =
    positive === false
      ? variant === "investment"
        ? "#dc2626"
        : "#2563eb"
      : variant === "investment"
        ? "#0f766e"
        : "#16a34a";
  const accentClass =
    positive === false
      ? variant === "investment"
        ? "text-red-600"
        : "text-sky-700"
      : variant === "investment"
        ? "text-teal-700"
        : "text-emerald-700";

  return (
    <div className="flex min-h-[250px] flex-col rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>

      <div className="relative mt-4 flex items-center justify-center">
        <svg viewBox="0 0 200 120" className="h-32 w-full max-w-[240px]">
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="16"
            strokeLinecap="round"
            pathLength={100}
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={strokeColor}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${normalizedProgress} 100`}
            pathLength={100}
          />
        </svg>

        <div className="absolute bottom-4 flex flex-col items-center">
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Atingimento</span>
          <span className={cn("text-2xl font-semibold tracking-tight", accentClass)}>
            {progressText}
          </span>
        </div>
      </div>

      <div className="mt-2 text-center text-lg font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {helper ? <div className="mt-2 text-center text-xs text-slate-500">{helper}</div> : null}
      {progressLabel ? (
        <div className={cn("mt-auto pt-4 text-center text-xs font-medium", accentClass)}>
          {progressLabel}
        </div>
      ) : null}
    </div>
  );
}

function AccountTimelineChart({
  data,
  accountKey,
  dailyGoalLeads,
  reportMode,
}: {
  data: Array<{
    date: string;
    label: string;
    leads: number;
    goalLeadsPerDay?: number | null;
  }>;
  accountKey: string;
  dailyGoalLeads: number | null;
  reportMode: boolean;
}) {
  if (data.length === 0) {
    return null;
  }

  const chartId = `accountLeadsFill-${accountKey.replace(/[^a-z0-9]/gi, "-")}`;
  const chartData = data.map((point) => ({
    ...point,
    goalLeadsPerDay: dailyGoalLeads,
  }));

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/94 p-4 shadow-[0_18px_42px_-38px_rgba(15,23,42,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Evolução diária
          </p>
          <h3 className="text-sm font-semibold text-slate-950">Leads por dia</h3>
        </div>
      </div>

      <ChartContainer
        config={{
          leads: {
            label: "Leads",
            color: "#2563eb",
          },
          goalLeadsPerDay: {
            label: "Meta diaria",
            color: "#f59e0b",
          },
        }}
        className="h-[190px] w-full"
      >
        <ComposedChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 7" stroke="rgba(148,163,184,0.16)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tickMargin={8}
            tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 500 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={30}
            tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 500 }}
          />
          <ChartTooltip
            cursor={{ stroke: "rgba(37,99,235,0.24)", strokeDasharray: "4 6" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as
                | { label: string; leads: number; goalLeadsPerDay?: number | null }
                | undefined;
              if (!point) return null;

              return (
                <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 text-xs shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)] backdrop-blur">
                  <div className="font-semibold text-slate-950">{point.label}</div>
                  <div className="mt-2 flex items-center justify-between gap-6">
                    <span className="text-slate-500">Leads</span>
                    <span className="font-semibold text-slate-950">
                      {formatInteger(point.leads)}
                    </span>
                  </div>
                  {point.goalLeadsPerDay !== null && point.goalLeadsPerDay !== undefined ? (
                    <div className="mt-2 flex items-center justify-between gap-6">
                      <span className="text-slate-500">Meta diaria</span>
                      <span className="font-semibold text-amber-600">
                        {point.goalLeadsPerDay.toFixed(1)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="leads"
            stroke="none"
            fill={`url(#${chartId})`}
            dot={false}
            activeDot={false}
            isAnimationActive={!reportMode}
          />
          <Area
            type="monotone"
            dataKey="leads"
            stroke="#2563eb"
            strokeWidth={2.5}
            fill="transparent"
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 3,
              stroke: "rgba(255,255,255,0.95)",
              fill: "#2563eb",
            }}
            isAnimationActive={!reportMode}
          />
          {dailyGoalLeads !== null ? (
            <Line
              type="monotone"
              dataKey="goalLeadsPerDay"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 6"
              dot={false}
              activeDot={false}
              isAnimationActive={!reportMode}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
