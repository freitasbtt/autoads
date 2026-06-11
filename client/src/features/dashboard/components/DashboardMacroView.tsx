import { useMemo } from "react";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function renderVariationChip(current: number, previous: number, invertGood = false) {
  const trend = calcTrend(current, previous, invertGood);
  const isPositive = trend?.positive ?? current >= previous;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        isPositive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700",
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      {formatVariationPercent(current, previous)}
    </span>
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

  const aggregateDailyGoalLeads = useMemo(() => {
    const total = accounts.reduce(
      (sum, account) => sum + (account.goal?.dailyLeadTarget ?? 0),
      0,
    );
    return total > 0 ? total : null;
  }, [accounts]);

  const macroTimelineData = useMemo(
    () =>
      timelineData.map((point) => ({
        ...point,
        goalLeadsPerDay: aggregateDailyGoalLeads,
      })),
    [aggregateDailyGoalLeads, timelineData],
  );

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
    () =>
      [...leadsByAccountData].sort((a, b) => {
        const leadDiff = b.leads - a.leads;
        if (leadDiff !== 0) return leadDiff;
        return b.spend - a.spend;
      }),
    [leadsByAccountData],
  );
  const currentPeriodLabel = useMemo(() => {
    const start = metricsData?.dateRange.start;
    const end = metricsData?.dateRange.end;
    if (!start || !end) return "Periodo atual";

    return `${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${start}T00:00:00`))} - ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${end}T00:00:00`))}`;
  }, [metricsData?.dateRange.end, metricsData?.dateRange.start]);

  const previousPeriodLabel = useMemo(() => {
    const start = metricsData?.dateRange.previousStart;
    const end = metricsData?.dateRange.previousEnd;
    if (!start || !end) return "Periodo anterior";

    return `${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${start}T00:00:00`))} - ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${end}T00:00:00`))}`;
  }, [metricsData?.dateRange.previousEnd, metricsData?.dateRange.previousStart]);

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
                {aggregateDailyGoalLeads !== null ? (
                  <div className="rounded-full border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[11px] text-amber-700">
                    <span className="font-semibold">Meta diaria total:</span>{" "}
                    {aggregateDailyGoalLeads.toFixed(1)}
                  </div>
                ) : null}
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
                config={{
                  leads: { label: "Leads", color: "#2563eb" },
                  goalLeadsPerDay: { label: "Meta diaria total", color: "#f59e0b" },
                }}
                className="h-[300px] w-full rounded-[20px] bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.98))] p-2"
              >
                <ComposedChart data={macroTimelineData} margin={{ left: 2, right: 18, top: 16, bottom: 4 }}>
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
                      const point = payload[0]?.payload as
                        | (DashboardTimelinePoint & { goalLeadsPerDay?: number | null })
                        | undefined;
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
                            {point.goalLeadsPerDay !== null && point.goalLeadsPerDay !== undefined ? (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Meta diaria total</span>
                                <span className="font-semibold text-amber-600">
                                  {point.goalLeadsPerDay.toFixed(1)}
                                </span>
                              </div>
                            ) : null}
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
                  {aggregateDailyGoalLeads !== null ? (
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
                </ComposedChart>
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

      <div className="grid gap-5 print:grid-cols-1">
        <Card className={panelClass}>
          <CardHeader className="space-y-1 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Comparativo
            </div>
            <CardTitle className="text-lg font-semibold text-slate-950">
              Leads e investimento por conta
            </CardTitle>
          </CardHeader>

          <CardContent>
            {leadsByAccountData.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Nenhuma conta encontrada para o periodo.
              </div>
            ) : (
              <div className="space-y-3 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Atual: <span className="font-semibold text-slate-950">{currentPeriodLabel}</span>
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Comparativo:{" "}
                    <span className="font-semibold text-slate-950">{previousPeriodLabel}</span>
                  </span>
                </div>
                <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white/90">
                  <Table className="min-w-[920px]">
                    <TableHeader className="bg-slate-50/90">
                      <TableRow className="hover:bg-slate-50/90">
                        <TableHead className="min-w-[220px]">Conta</TableHead>
                        <TableHead className="text-right">Leads atual</TableHead>
                        <TableHead className="text-right">Leads anterior</TableHead>
                        <TableHead className="text-right">Var. leads</TableHead>
                        <TableHead className="text-right">Invest. atual</TableHead>
                        <TableHead className="text-right">Invest. anterior</TableHead>
                        <TableHead className="text-right">Var. invest.</TableHead>
                        <TableHead className="text-right">CPL atual</TableHead>
                        <TableHead className="text-right">CPL anterior</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leadsByAccountRanking.map((entry) => (
                        <TableRow key={`${entry.name}-comparison-row`} className="bg-transparent">
                          <TableCell className="font-semibold text-slate-900">{entry.name}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">
                            {formatInteger(entry.leads)}
                          </TableCell>
                          <TableCell className="text-right text-slate-600">
                            {formatInteger(entry.previousLeads)}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderVariationChip(entry.leads, entry.previousLeads)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">
                            {formatCurrency(entry.spend)}
                          </TableCell>
                          <TableCell className="text-right text-slate-600">
                            {formatCurrency(entry.previousSpend)}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderVariationChip(entry.spend, entry.previousSpend)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-950">
                            {entry.costPerLead !== null ? formatCurrency(entry.costPerLead) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-slate-600">
                            {entry.previousCostPerLead !== null
                              ? formatCurrency(entry.previousCostPerLead)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                  Ordenado por volume atual de leads. O comparativo usa exatamente o mesmo recorte
                  de dias no mes anterior.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
