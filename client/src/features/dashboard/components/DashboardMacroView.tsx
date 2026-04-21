import { useMemo } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type {
  DashboardAccountMetrics,
  DashboardFunnelStep,
  DashboardLeadsByAccountDatum,
  DashboardMetricsResponse,
  DashboardSpendByAccountDatum,
  DashboardTimelinePoint,
} from "../types";
import { calcTrend, formatCurrency, formatInteger } from "../utils";
import { AwaitingFilterCard } from "./DashboardControls";

type DashboardMacroViewProps = {
  isSharedMode: boolean;
  reportMode?: boolean;
  hasSelectedAccounts: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  metricsData?: DashboardMetricsResponse;
  accounts: DashboardAccountMetrics[];
  timelineData: DashboardTimelinePoint[];
  funnelSteps: DashboardFunnelStep[];
  leadsByAccountData: DashboardLeadsByAccountDatum[];
  spendByAccountData: DashboardSpendByAccountDatum[];
  onRetry: () => void;
};

function formatVariationPercent(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return current > 0 ? "+100%" : "0%";
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(0)}%`;
}

function BarScale() {
  return (
    <div className="grid grid-cols-5 text-[10px] font-medium text-slate-400">
      <span>0%</span>
      <span className="text-center">25%</span>
      <span className="text-center">50%</span>
      <span className="text-center">75%</span>
      <span className="text-right">100%</span>
    </div>
  );
}

function NumericBarScale({ max }: { max: number }) {
  const safeMax = Math.max(max, 1);
  const values = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(safeMax * ratio),
  );

  return (
    <div className="grid grid-cols-5 text-[10px] font-medium text-slate-400">
      <span>{formatInteger(values[0])}</span>
      <span className="text-center">{formatInteger(values[1])}</span>
      <span className="text-center">{formatInteger(values[2])}</span>
      <span className="text-center">{formatInteger(values[3])}</span>
      <span className="text-right">{formatInteger(values[4])}</span>
    </div>
  );
}

export function DashboardMacroView({
  isSharedMode,
  reportMode = false,
  hasSelectedAccounts,
  isLoading,
  isError,
  error,
  metricsData,
  accounts,
  timelineData,
  funnelSteps,
  leadsByAccountData,
  spendByAccountData,
  onRetry,
}: DashboardMacroViewProps) {
  const panelClass =
    "overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/92 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.36)] backdrop-blur";

  const lineSummary = useMemo(() => {
    if (timelineData.length === 0) {
      return { maxPoint: null, minPoint: null, averageLeads: 0 };
    }

    let maxPoint = timelineData[0];
    let minPoint = timelineData[0];
    let totalLeads = 0;

    for (const point of timelineData) {
      totalLeads += point.leads;
      if (point.leads > maxPoint.leads) maxPoint = point;
      if (point.leads < minPoint.leads) minPoint = point;
    }

    return {
      maxPoint,
      minPoint,
      averageLeads: totalLeads / timelineData.length,
    };
  }, [timelineData]);

  const funnelInsights = useMemo(() => {
    const previousTotals = metricsData?.previousTotals;

    return funnelSteps.map((step) => {
      const previousValue =
        step.label === "Alcance"
          ? previousTotals?.reach ?? null
          : step.label === "Cliques"
            ? previousTotals?.clicks ?? null
            : step.label === "Leads"
              ? previousTotals?.leads ?? null
              : null;

      return {
        ...step,
        trend: calcTrend(step.value, previousValue),
      };
    });
  }, [funnelSteps, metricsData?.previousTotals]);

  const leadsByAccountRanking = useMemo(
    () => [...leadsByAccountData].sort((a, b) => b.leads - a.leads),
    [leadsByAccountData],
  );

  const maxLeadCompareValue = useMemo(
    () =>
      Math.max(
        1,
        ...leadsByAccountData.flatMap((entry) => [entry.leads, entry.previousLeads]),
      ),
    [leadsByAccountData],
  );

  const investmentRanking = useMemo(
    () => [...spendByAccountData].sort((a, b) => b.percentage - a.percentage),
    [spendByAccountData],
  );

  if (!hasSelectedAccounts) {
    return <AwaitingFilterCard isSharedMode={isSharedMode} />;
  }

  if (isLoading && !metricsData) {
    return (
      <Card className={panelClass}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Carregando visao macro...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="rounded-[24px] border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-destructive">
            Falha ao carregar a visao macro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {error?.message ?? "Nao foi possivel carregar os dados."}
          </p>
          <Button variant="outline" onClick={onRetry}>
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
          Nenhum dado encontrado para os filtros selecionados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] print:grid-cols-1">
        <Card className={panelClass}>
          <CardHeader className="space-y-2 pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Tendencia
                </div>
                <CardTitle className="text-lg font-semibold text-slate-950">Leads diarios</CardTitle>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-[11px] text-blue-700">
                  <span className="font-semibold">Pico:</span>{" "}
                  {lineSummary.maxPoint
                    ? `${formatInteger(lineSummary.maxPoint.leads)} em ${lineSummary.maxPoint.label}`
                    : "N/D"}
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1.5 text-[11px] text-slate-600">
                  <span className="font-semibold">Media diaria:</span>{" "}
                  {formatInteger(lineSummary.averageLeads)}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {timelineData.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Nenhum dado diario disponivel para o periodo selecionado.
              </div>
            ) : (
              <ChartContainer
                config={{ leads: { label: "Leads", color: "#2563eb" } }}
                className="h-[300px] w-full rounded-[20px] bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.98))] p-2"
              >
                <AreaChart data={timelineData} margin={{ left: 2, right: 18, top: 16, bottom: 4 }}>
                  <defs>
                    <linearGradient id="leadsAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.34} />
                      <stop offset="65%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#dbeafe" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 7" stroke="rgba(148,163,184,0.18)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickMargin={10}
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tickMargin={10}
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }}
                  />
                  <ChartTooltip
                    cursor={{ stroke: "rgba(37,99,235,0.25)", strokeWidth: 1.5, strokeDasharray: "4 6" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0]?.payload as DashboardTimelinePoint | undefined;
                      if (!point) return null;

                      return (
                        <div className="min-w-[210px] rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 text-xs shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)] backdrop-blur">
                          <div className="font-semibold text-slate-950">{point.label}</div>
                          <div className="mt-3 grid gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Leads</span>
                              <span className="font-semibold text-slate-950">{formatInteger(point.leads)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Custo por lead</span>
                              <span className="font-semibold text-slate-950">
                                {point.costPerLead !== null ? formatCurrency(point.costPerLead) : "--"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Gasto</span>
                              <span className="font-semibold text-slate-950">{formatCurrency(point.spend)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="none"
                    fill="url(#leadsAreaFill)"
                    activeDot={false}
                    isAnimationActive={!reportMode}
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="transparent"
                    dot={false}
                    isAnimationActive={!reportMode}
                    activeDot={{
                      r: 5,
                      strokeWidth: 4,
                      stroke: "rgba(255,255,255,0.95)",
                      fill: "#2563eb",
                    }}
                  />
                  {lineSummary.maxPoint && (
                    <ReferenceDot
                      x={lineSummary.maxPoint.label}
                      y={lineSummary.maxPoint.leads}
                      r={5.5}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={3}
                    />
                  )}
                  {lineSummary.minPoint &&
                  lineSummary.minPoint.date !== lineSummary.maxPoint?.date ? (
                    <ReferenceDot
                      x={lineSummary.minPoint.label}
                      y={lineSummary.minPoint.leads}
                      r={4.5}
                      fill="#0f172a"
                      stroke="#ffffff"
                      strokeWidth={3}
                    />
                  ) : null}
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className={panelClass}>
          <CardHeader className="space-y-1 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Conversao
            </div>
            <CardTitle className="text-lg font-semibold text-slate-950">Funil do periodo</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-2.5 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-3">
              {funnelInsights.map((step) => (
                <div key={step.label} className="flex justify-center">
                  <div
                    className={cn(
                      "relative flex min-h-[82px] flex-col items-center justify-center overflow-hidden px-5 text-center text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)]",
                      step.fill,
                    )}
                    style={{
                      width: step.width,
                      clipPath: "polygon(0 0, 100% 0, 85% 100%, 15% 100%)",
                    }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_42%,rgba(15,23,42,0.1))]" />
                    <div className="relative flex flex-col items-center gap-1.5">
                      <div className="text-sm font-medium text-white/85">{step.label}</div>
                      <div className="text-2xl font-semibold tracking-tight text-white">
                        {formatInteger(step.value)}
                      </div>
                      {step.trend && (
                        <div
                          className={cn(
                            "flex items-center gap-1 text-xs font-semibold",
                            step.trend.positive ? "text-emerald-100" : "text-red-100",
                          )}
                        >
                          {step.trend.positive ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {step.trend.value}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 print:grid-cols-1">
        <Card className={panelClass}>
          <CardHeader className="space-y-1 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Ranking
            </div>
            <CardTitle className="text-lg font-semibold text-slate-950">Leads por conta</CardTitle>
          </CardHeader>

          <CardContent>
            {leadsByAccountData.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Nenhuma conta com leads no periodo.
              </div>
            ) : (
              <div className="space-y-3 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4">
                <div className="space-y-3">
                  {leadsByAccountRanking.map((entry) => {
                    const currentWidth = Math.max((entry.leads / maxLeadCompareValue) * 100, entry.leads > 0 ? 3 : 0);
                    const variation = formatVariationPercent(entry.leads, entry.previousLeads);
                    const isPositive = entry.leads >= entry.previousLeads;

                    return (
                      <div key={`${entry.name}-leads-row`} className="grid gap-2 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-semibold text-slate-900">{entry.name}</div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-950">
                              {formatInteger(entry.leads)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs font-semibold",
                                isPositive ? "text-emerald-600" : "text-red-600",
                              )}
                            >
                              {isPositive ? (
                                <TrendingUp className="h-3.5 w-3.5" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5" />
                              )}
                              {variation}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pl-0">
                          <div className="h-4 overflow-hidden rounded bg-slate-100">
                            <div className="h-full rounded bg-blue-600" style={{ width: `${currentWidth}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <NumericBarScale max={maxLeadCompareValue} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={panelClass}>
          <CardHeader className="space-y-1 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Distribuicao
            </div>
            <CardTitle className="text-lg font-semibold text-slate-950">
              Investimento por conta
            </CardTitle>
          </CardHeader>

          <CardContent>
            {spendByAccountData.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Nenhuma conta com investimento no periodo.
              </div>
            ) : (
              <div className="space-y-3 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4">
                {investmentRanking.map((entry) => (
                  <div key={`${entry.name}-investment-row`} className="grid gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 truncate font-semibold text-slate-900">{entry.name}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-500">
                          {formatCurrency(entry.value)}
                        </span>
                        <span className="text-sm font-semibold text-blue-700">
                          {entry.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="h-4 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-blue-600"
                        style={{
                          width: `${Math.max(entry.percentage, entry.percentage > 0 ? 3 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <BarScale />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
