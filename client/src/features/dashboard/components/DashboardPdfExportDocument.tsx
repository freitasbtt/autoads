import { useMemo, type ReactNode } from "react";
import { BarChart3, FileText, ImageIcon, Layers3, Table2, Target } from "lucide-react";

import type {
  ActiveFilterChip,
  DashboardAccountMetrics,
  DashboardFunnelStep,
  DashboardKpi,
  DashboardLeadsByAccountDatum,
  DashboardMetricsResponse,
  DashboardSpendByAccountDatum,
  DashboardTimelinePoint,
  DashboardTopCreative,
  DashboardTopCreativesAccountGroup,
} from "../types";
import {
  formatCurrency,
  formatFrequency,
  formatInteger,
  formatPercent,
  getCTR,
  getCostPerLead,
  getObjectiveLabel,
  getStatusLabel,
  summarizeResult,
} from "../utils";

type DashboardPdfExportDocumentProps = {
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
  funnelSteps: DashboardFunnelStep[];
  leadsByAccountData: DashboardLeadsByAccountDatum[];
  spendByAccountData: DashboardSpendByAccountDatum[];
  topCreativesByAccount: DashboardTopCreativesAccountGroup[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

type CampaignExportRow = {
  accountName: string;
  accountValue: string;
  campaignId: string;
  campaignName: string;
  objectiveLabel: string;
  statusLabel: string;
  spend: number;
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  ctr: number | null;
};

type CampaignExportSlice = {
  accountId: number;
  accountName: string;
  accountValue: string;
  pageIndex: number;
  totalPages: number;
  rows: CampaignExportRow[];
  accountMetrics: DashboardAccountMetrics["metrics"];
};

type CreativeExportSlice = {
  accountId: number;
  accountName: string;
  accountValue: string;
  pageIndex: number;
  totalPages: number;
  creatives: DashboardTopCreative[];
};

const TIMELINE_WIDTH = 860;
const TIMELINE_HEIGHT = 260;
const TIMELINE_PADDING = { top: 18, right: 20, bottom: 30, left: 40 };
const DONUT_SIZE = 230;
const DONUT_STROKE = 36;
const PDF_WRAP = "whitespace-normal break-words [overflow-wrap:anywhere]";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function packWeighted<T>(
  items: T[],
  capacity: number,
  getWeight: (item: T) => number,
): T[][] {
  const pages: T[][] = [];
  let currentPage: T[] = [];
  let currentWeight = 0;

  for (const item of items) {
    const weight = Math.max(1, getWeight(item));
    if (currentPage.length > 0 && currentWeight + weight > capacity) {
      pages.push(currentPage);
      currentPage = [];
      currentWeight = 0;
    }

    currentPage.push(item);
    currentWeight += weight;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function buildTimelineGeometry(data: DashboardTimelinePoint[]) {
  const plotWidth = TIMELINE_WIDTH - TIMELINE_PADDING.left - TIMELINE_PADDING.right;
  const plotHeight = TIMELINE_HEIGHT - TIMELINE_PADDING.top - TIMELINE_PADDING.bottom;
  const maxValue = Math.max(...data.map((point) => point.leads), 1);
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const points = data.map((point, index) => {
    const x = TIMELINE_PADDING.left + stepX * index;
    const y =
      TIMELINE_PADDING.top + plotHeight - (point.leads / maxValue) * plotHeight;
    return { x, y, point };
  });

  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1]?.x ?? TIMELINE_PADDING.left} ${
        TIMELINE_PADDING.top + plotHeight
      } L ${points[0]?.x ?? TIMELINE_PADDING.left} ${TIMELINE_PADDING.top + plotHeight} Z`
    : "";
  const gridValues = Array.from({ length: 4 }, (_, index) =>
    Math.round((maxValue / 3) * (3 - index)),
  );
  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  const peak = data.reduce<DashboardTimelinePoint | null>(
    (current, point) => (!current || point.leads > current.leads ? point : current),
    null,
  );
  const low = data.reduce<DashboardTimelinePoint | null>(
    (current, point) => (!current || point.leads < current.leads ? point : current),
    null,
  );

  return {
    maxValue,
    gridValues,
    points,
    linePath,
    areaPath,
    labelStep,
    peak,
    low,
    plotHeight,
  };
}

function buildDonutSegments(data: DashboardSpendByAccountDatum[]) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return [];
  }

  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return data.map((item) => {
    const fraction = item.value / total;
    const length = circumference * fraction;
    const offset = circumference * (1 - accumulated);
    accumulated += fraction;

    return {
      ...item,
      radius,
      circumference,
      strokeDasharray: `${length} ${circumference - length}`,
      strokeDashoffset: offset,
    };
  });
}

function PageShell({
  section,
  title,
  description,
  pageNumber,
  pageCount,
  icon,
  children,
}: {
  section: string;
  title: string;
  description: string;
  pageNumber: number;
  pageCount: number;
  icon: typeof FileText;
  children: ReactNode;
}) {
  const Icon = icon;

  return (
    <section
      data-export-chunk="true"
      className={`w-[980px] space-y-6 rounded-[32px] border border-slate-200 bg-white px-10 py-9 text-slate-950 shadow-[0_28px_70px_-44px_rgba(15,23,42,0.32)] ${PDF_WRAP}`}
    >
      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {section}
            </div>
            <h2 className="text-[1.65rem] font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className={`max-w-3xl text-sm leading-6 text-slate-600 ${PDF_WRAP}`}>{description}</p>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pagina
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {pageNumber} / {pageCount}
          </div>
        </div>
      </header>

      {children}
    </section>
  );
}

function MetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={`rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3.5 ${PDF_WRAP}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 ${PDF_WRAP}`}>
        {label}
      </div>
      <div className={`mt-2 text-sm font-semibold text-slate-950 ${PDF_WRAP}`}>{value}</div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  trend,
  icon: Icon,
}: DashboardKpi) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {title}
        </div>
        <Icon className="mt-0.5 h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-3 text-[1.65rem] font-semibold leading-none tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        {trend
          ? `${trend.positive ? "Variacao positiva" : "Variacao negativa"} de ${trend.value}`
          : "Sem comparativo"}
      </div>
    </div>
  );
}

function TimelineCard({
  timelineData,
}: {
  timelineData: DashboardTimelinePoint[];
}) {
  if (timelineData.length === 0) {
    return (
      <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-sm text-slate-600">
        Nenhum dado diario disponivel para o periodo selecionado.
      </div>
    );
  }

  const geometry = buildTimelineGeometry(timelineData);
  const peakPoint = geometry.points.find((entry) => entry.point.date === geometry.peak?.date);
  const lowPoint = geometry.points.find((entry) => entry.point.date === geometry.low?.date);

  return (
    <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Grafico de linha
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950">Leads diarios</div>
        </div>
        <div className="grid gap-2 text-right text-[11px] text-slate-600">
          <div>
            <span className="font-semibold text-slate-900">Pico:</span>{" "}
            {geometry.peak
              ? `${formatInteger(geometry.peak.leads)} em ${geometry.peak.label}`
              : "N/D"}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Vale:</span>{" "}
            {geometry.low
              ? `${formatInteger(geometry.low.leads)} em ${geometry.low.label}`
              : "N/D"}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${TIMELINE_WIDTH} ${TIMELINE_HEIGHT}`}
        className="h-[280px] w-full overflow-visible rounded-[18px] bg-slate-50/80"
      >
        <defs>
          <linearGradient id="pdfTimelineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#60a5fa" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {geometry.gridValues.map((value) => {
          const y =
            TIMELINE_PADDING.top +
            geometry.plotHeight -
            (value / geometry.maxValue) * geometry.plotHeight;

          return (
            <g key={`grid-${value}`}>
              <line
                x1={TIMELINE_PADDING.left}
                y1={y}
                x2={TIMELINE_WIDTH - TIMELINE_PADDING.right}
                y2={y}
                stroke="rgba(148,163,184,0.18)"
                strokeDasharray="4 6"
              />
              <text
                x={TIMELINE_PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="11"
                fontWeight="600"
              >
                {formatInteger(value)}
              </text>
            </g>
          );
        })}

        <path d={geometry.areaPath} fill="url(#pdfTimelineArea)" />
        <path
          d={geometry.linePath}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {geometry.points.map(({ x, point }, index) => {
          if (
            index % geometry.labelStep !== 0 &&
            index !== geometry.points.length - 1 &&
            index !== 0
          ) {
            return null;
          }

          return (
            <text
              key={`label-${point.date}`}
              x={x}
              y={TIMELINE_HEIGHT - 10}
              textAnchor="middle"
              fill="#64748b"
              fontSize="11"
              fontWeight="600"
            >
              {point.label}
            </text>
          );
        })}

        {peakPoint ? (
          <>
            <circle
              cx={peakPoint.x}
              cy={peakPoint.y}
              r="6.5"
              fill="#2563eb"
              stroke="white"
              strokeWidth="4"
            />
            <text
              x={peakPoint.x}
              y={peakPoint.y - 16}
              textAnchor="middle"
              fill="#2563eb"
              fontSize="11"
              fontWeight="700"
            >
              {formatInteger(peakPoint.point.leads)}
            </text>
          </>
        ) : null}

        {lowPoint && lowPoint.point.date !== peakPoint?.point.date ? (
          <circle
            cx={lowPoint.x}
            cy={lowPoint.y}
            r="5.5"
            fill="#0f172a"
            stroke="white"
            strokeWidth="4"
          />
        ) : null}
      </svg>
    </div>
  );
}

function FunnelCard({
  funnelSteps,
}: {
  funnelSteps: DashboardFunnelStep[];
}) {
  const topValue = funnelSteps[0]?.value ?? 0;

  return (
    <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Funil do periodo
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-950">Alcance, cliques e leads</div>
      </div>

      <div className="space-y-3">
        {funnelSteps.map((step, index) => {
          const previousValue = index > 0 ? funnelSteps[index - 1]?.value ?? 0 : 0;
          const ratio = previousValue > 0 ? (step.value / previousValue) * 100 : 100;

          return (
            <div key={step.label} className="flex justify-center">
              <div
                className={`relative flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[18px] px-3 text-center text-white shadow-[0_18px_36px_-30px_rgba(15,23,42,0.5)] ${PDF_WRAP}`}
                style={{
                  width: step.width,
                  background: step.fill.includes("emerald")
                    ? "linear-gradient(180deg,#22c55e,#16a34a)"
                    : step.fill.includes("blue")
                      ? "linear-gradient(180deg,#3b82f6,#2563eb)"
                      : "linear-gradient(180deg,#64748b,#475569)",
                  clipPath: "polygon(0 0,100% 0,84% 100%,16% 100%)",
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_46%,rgba(15,23,42,0.1))]" />
                <div className="relative text-sm font-medium text-white/88">{step.label}</div>
                <div className="relative text-[2rem] font-semibold leading-none tracking-tight text-white">
                  {formatInteger(step.value)}
                </div>
                <div className="relative rounded-full bg-white/14 px-3 py-1 text-[11px] font-medium text-white/86">
                  {index === 0
                    ? "Base do funil"
                    : `${ratio.toFixed(1)}% da etapa anterior`}
                </div>
                {topValue > 0 && index > 0 ? (
                  <div className="relative text-[10px] text-white/80">
                    {((step.value / topValue) * 100).toFixed(1)}% do topo
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingCard({
  leadsByAccountData,
}: {
  leadsByAccountData: DashboardLeadsByAccountDatum[];
}) {
  const sorted = [...leadsByAccountData].sort((a, b) => b.leads - a.leads);
  const maxLeads = Math.max(...sorted.map((item) => item.leads), 1);

  return (
    <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Ranking de contas
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-950">Leads por conta</div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Nenhuma conta com leads no periodo.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item, index) => (
            <div key={`ranking-${item.name}`} className="grid gap-2">
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700">
                    {index + 1}
                  </span>
                  <span className={`font-semibold text-slate-900 ${PDF_WRAP}`}>{item.name}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <span>{formatCurrency(item.spend)}</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                    {formatInteger(item.leads)} leads
                  </span>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#0ea5e9)]"
                  style={{
                    width: `${Math.max((item.leads / maxLeads) * 100, item.leads > 0 ? 8 : 0)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DonutCard({
  spendByAccountData,
}: {
  spendByAccountData: DashboardSpendByAccountDatum[];
}) {
  const segments = buildDonutSegments(spendByAccountData);
  const total = spendByAccountData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Distribuicao de investimento
        </div>
        <div className="mt-1 text-lg font-semibold text-slate-950">Investimento por conta</div>
      </div>

      {segments.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Nenhuma conta com investimento no periodo.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-[22px] border border-slate-200 bg-white/75 p-4">
            <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
              <g transform={`translate(${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}) rotate(-90)`}>
                <circle
                  cx="0"
                  cy="0"
                  r={(DONUT_SIZE - DONUT_STROKE) / 2}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={DONUT_STROKE}
                />
                {segments.map((segment) => (
                  <circle
                    key={`donut-${segment.name}`}
                    cx="0"
                    cy="0"
                    r={segment.radius}
                    fill="none"
                    stroke={segment.fill}
                    strokeWidth={DONUT_STROKE}
                    strokeLinecap="butt"
                    strokeDasharray={segment.strokeDasharray}
                    strokeDashoffset={segment.strokeDashoffset}
                  />
                ))}
              </g>
              <text
                x="50%"
                y="47%"
                textAnchor="middle"
                fill="#64748b"
                fontSize="11"
                fontWeight="700"
              >
                Total investido
              </text>
              <text
                x="50%"
                y="57%"
                textAnchor="middle"
                fill="#0f172a"
                fontSize="18"
                fontWeight="700"
              >
                {formatCurrency(total)}
              </text>
            </svg>
          </div>

          <div className="grid content-start gap-2">
            {segments.map((segment) => (
              <div
                key={`legend-${segment.name}`}
                className="rounded-[18px] border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.fill }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-semibold text-slate-900 ${PDF_WRAP}`}>
                      {segment.name}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>{formatCurrency(segment.value)}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">
                        {segment.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountCampaignBlock({
  slice,
}: {
  slice: CampaignExportSlice;
}) {
  const costPerLead = getCostPerLead(slice.accountMetrics.spend, slice.accountMetrics.leads);

  return (
    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`text-sm font-semibold text-slate-950 ${PDF_WRAP}`}>{slice.accountName}</div>
          <div className={`mt-1 font-mono text-xs text-slate-500 ${PDF_WRAP}`}>{slice.accountValue}</div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
          Parte {slice.pageIndex} de {slice.totalPages}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetaBlock label="Gasto" value={formatCurrency(slice.accountMetrics.spend)} />
        <MetaBlock label="Leads" value={formatInteger(slice.accountMetrics.leads)} />
        <MetaBlock
          label="Conversas"
          value={formatInteger(slice.accountMetrics.messagingConversationsStarted)}
        />
        <MetaBlock
          label="CPL"
          value={costPerLead !== null ? formatCurrency(costPerLead) : "N/D"}
        />
      </div>

      <div className="overflow-visible rounded-[20px] border border-slate-200">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-slate-100">
            <tr className="border-b border-slate-200">
              <th className="w-[26%] px-4 py-3 text-left font-semibold uppercase tracking-[0.14em] text-slate-500">
                Campanha
              </th>
              <th className="w-[16%] px-3 py-3 text-left font-semibold uppercase tracking-[0.14em] text-slate-500">
                Conta
              </th>
              <th className="w-[14%] px-3 py-3 text-left font-semibold uppercase tracking-[0.14em] text-slate-500">
                Objetivo
              </th>
              <th className="w-[12%] px-3 py-3 text-left font-semibold uppercase tracking-[0.14em] text-slate-500">
                Status
              </th>
              <th className="w-[12%] px-3 py-3 text-right font-semibold uppercase tracking-[0.14em] text-slate-500">
                Gasto
              </th>
              <th className="w-[14%] px-3 py-3 text-right font-semibold uppercase tracking-[0.14em] text-slate-500">
                Resultado
              </th>
              <th className="w-[10%] px-3 py-3 text-right font-semibold uppercase tracking-[0.14em] text-slate-500">
                CTR
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.rows.map((row, rowIndex) => (
              <tr
                key={`${slice.accountId}-${row.campaignId}-${rowIndex}`}
                className="border-b border-slate-100 last:border-b-0"
              >
                <td className="px-4 py-3.5 align-top">
                  <div className="space-y-1">
                    <div className={`font-semibold text-slate-950 ${PDF_WRAP}`}>
                      {row.campaignName}
                    </div>
                    <div className="text-[10px] text-slate-500">ID #{row.campaignId}</div>
                  </div>
                </td>
                <td className={`px-3 py-3.5 align-top text-slate-700 ${PDF_WRAP}`}>
                  {row.accountName}
                </td>
                <td className={`px-3 py-3.5 align-top text-slate-700 ${PDF_WRAP}`}>
                  {row.objectiveLabel}
                </td>
                <td className={`px-3 py-3.5 align-top text-slate-700 ${PDF_WRAP}`}>
                  {row.statusLabel}
                </td>
                <td className="px-3 py-3.5 text-right font-mono align-top text-slate-950">
                  {formatCurrency(row.spend)}
                </td>
                <td className="px-3 py-3.5 text-right align-top">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      {row.resultLabel}
                    </div>
                    <div className="font-semibold text-slate-950">
                      {row.resultQuantity !== null ? formatInteger(row.resultQuantity) : "N/D"}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {row.costPerResult !== null ? formatCurrency(row.costPerResult) : "N/D"}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right font-mono align-top text-slate-950">
                  {formatPercent(row.ctr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreativeCard({
  creative,
}: {
  creative: DashboardTopCreative;
}) {
  return (
    <div className="flex gap-4 rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="flex h-[152px] w-[118px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50">
        {creative.thumbnailUrl ? (
          <img
            src={creative.thumbnailUrl}
            alt={creative.ad_name ?? "Criativo"}
            className="h-full w-full object-contain"
            loading="eager"
          />
        ) : (
          <span className="px-3 text-center text-xs text-slate-500">Sem miniatura</span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <div className={`text-sm font-semibold text-slate-950 ${PDF_WRAP}`}>
            {creative.ad_name ?? "Criativo sem nome"}
          </div>
          <div className={`text-xs text-slate-500 ${PDF_WRAP}`}>
            {creative.campaignName ?? `Campanha ${creative.campaignId}`}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <MetaBlock label={creative.resultLabel} value={formatInteger(creative.metrics.resultQty)} />
          <MetaBlock
            label="Custo / resultado"
            value={
              creative.metrics.costPerResult !== null
                ? formatCurrency(creative.metrics.costPerResult)
                : "N/D"
            }
          />
          <MetaBlock label="Gasto" value={formatCurrency(creative.metrics.spend)} />
          <MetaBlock label="Frequencia" value={formatFrequency(creative.metrics.frequency)} />
        </div>
      </div>
    </div>
  );
}

export function DashboardPdfExportDocument({
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
}: DashboardPdfExportDocumentProps) {
  const totalAccounts = selectedAccountIds.length > 0 ? selectedAccountIds.length : accounts.length;
  const totalCampaigns = accounts.reduce((sum, account) => sum + account.campaigns.length, 0);
  const totalCreatives = topCreativesByAccount.reduce(
    (sum, group) => sum + group.creatives.length,
    0,
  );

  const topLeadAccount = useMemo(
    () =>
      accounts.reduce<DashboardAccountMetrics | null>(
        (current, account) =>
          !current || account.metrics.leads > current.metrics.leads ? account : current,
        null,
      ),
    [accounts],
  );

  const topSpendAccount = useMemo(
    () =>
      accounts.reduce<DashboardAccountMetrics | null>(
        (current, account) =>
          !current || account.metrics.spend > current.metrics.spend ? account : current,
        null,
      ),
    [accounts],
  );

  const topCampaignSlice = useMemo<CampaignExportSlice | null>(() => {
    const rows = accounts
      .flatMap<CampaignExportRow>((account) =>
        account.campaigns.map((campaign) => {
          const result = summarizeResult(campaign.metrics, campaign.resultado);

          return {
            accountName: account.name,
            accountValue: account.value,
            campaignId: campaign.id,
            campaignName: campaign.name ?? `Campanha ${campaign.id}`,
            objectiveLabel: getObjectiveLabel(campaign.objective) || "Nao informado",
            statusLabel: campaign.status ? getStatusLabel(campaign.status) : "Nao informado",
            spend: campaign.metrics.spend,
            resultLabel: result.label,
            resultQuantity: result.quantidade,
            costPerResult: result.custo,
            ctr: getCTR(campaign.metrics.clicks, campaign.metrics.impressions),
          };
        }),
      )
      .sort((a, b) => {
        const resultDelta = (b.resultQuantity ?? 0) - (a.resultQuantity ?? 0);
        if (resultDelta !== 0) {
          return resultDelta;
        }

        const spendDelta = b.spend - a.spend;
        if (spendDelta !== 0) {
          return spendDelta;
        }

        return (b.ctr ?? 0) - (a.ctr ?? 0);
      })
      .slice(0, 5);

    if (rows.length === 0) {
      return null;
    }

    return {
      accountId: 0,
      accountName: "Top 5 campanhas do periodo",
      accountValue: "Ranking consolidado",
      pageIndex: 1,
      totalPages: 1,
      rows,
      accountMetrics: metricsData?.totals ?? {
        spend: 0,
        resultSpend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        leads: 0,
        messagingConversationsStarted: 0,
        results: 0,
        costPerResult: null,
      },
    };
  }, [accounts, metricsData]);

  const creativeSlices = useMemo<CreativeExportSlice[]>(() => {
    const slices: CreativeExportSlice[] = [];

    for (const group of topCreativesByAccount) {
      const creativeChunks = chunkArray(group.creatives, 4);

      creativeChunks.forEach((chunk, index) => {
        slices.push({
          accountId: group.accountId,
          accountName: group.accountName,
          accountValue: group.accountValue,
          pageIndex: index + 1,
          totalPages: creativeChunks.length,
          creatives: chunk,
        });
      });
    }

    return slices;
  }, [topCreativesByAccount]);

  const creativePages = useMemo(
    () =>
      packWeighted(creativeSlices, 12, (slice) => 5 + Math.ceil(slice.creatives.length / 2) * 3),
    [creativeSlices],
  );

  const pageCount =
    2 + 1 + Math.max(creativePages.length, 1);
  let pageNumber = 1;

  return (
    <div className="w-[980px] space-y-6 bg-slate-100 p-4 text-slate-950">
      <PageShell
        section="Resumo Executivo"
        title="Dashboard completo de performance"
        description="Versao de exportacao otimizada para PDF, com visao consolidada do periodo, KPIs principais, macroanalise, campanhas e criativos."
        pageNumber={pageNumber++}
        pageCount={pageCount}
        icon={Layers3}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_300px]">
          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,41,59,0.95))] px-6 py-6 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
              <FileText className="h-3.5 w-3.5" />
              Relatorio em PDF
            </div>
            <h1 className="mt-4 text-[2rem] font-semibold leading-tight tracking-tight">
              Performance consolidada do dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
              Documento executivo com o mesmo conjunto de informacoes do dashboard,
              reorganizado para leitura em paginas A4 com melhor distribuicao visual.
            </p>
          </div>

          <div className="grid gap-3">
            <MetaBlock label="Periodo" value={periodLabel} />
            <MetaBlock label="Gerado em" value={generatedAtLabel} />
            <MetaBlock label="Contas analisadas" value={formatInteger(totalAccounts)} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <MetaBlock label="Campanhas mapeadas" value={formatInteger(totalCampaigns)} />
          <MetaBlock label="Criativos exportados" value={formatInteger(totalCreatives)} />
          <MetaBlock
            label="Alcance total"
            value={formatInteger(metricsData?.totals.reach ?? 0)}
          />
          <MetaBlock
            label="Estado"
            value={
              isLoading
                ? "Carregando"
                : isError
                  ? error?.message ?? "Falha"
                  : hasSelectedAccounts
                    ? "Relatorio completo"
                    : "Sem contas"
            }
          />
        </div>

        {hasActiveFilters && activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <div
                key={`filter-${chip.label}-${chip.value}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700"
              >
                <span className="font-semibold">{chip.label}:</span> {chip.value}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Nenhum filtro adicional aplicado alem do periodo selecionado.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <KpiCard key={`pdf-kpi-${kpi.title}`} {...kpi} />
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Maior volume de leads
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {topLeadAccount?.name ?? "N/D"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {topLeadAccount
                    ? `${formatInteger(topLeadAccount.metrics.leads)} leads no periodo`
                    : "Sem dados para comparar"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Maior investimento
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {topSpendAccount?.name ?? "N/D"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {topSpendAccount
                    ? `${formatCurrency(topSpendAccount.metrics.spend)} investidos`
                    : "Sem dados para comparar"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageShell>

      <PageShell
        section="Macro"
        title="Graficos e visao macro"
        description="Analise visual da tendencia diaria, funil do periodo, ranking de leads e distribuicao de investimento."
        pageNumber={pageNumber++}
        pageCount={pageCount}
        icon={BarChart3}
      >
        <TimelineCard timelineData={timelineData} />

        <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <FunnelCard funnelSteps={funnelSteps} />
          <DonutCard spendByAccountData={spendByAccountData} />
        </div>

        <RankingCard leadsByAccountData={leadsByAccountData} />
      </PageShell>

      <PageShell
        section="Campanhas"
        title="Secao de campanhas"
        description="Resumo geral do periodo com destaque para as 5 campanhas de melhor resultado."
        pageNumber={pageNumber++}
        pageCount={pageCount}
        icon={Table2}
      >
        <div className="grid grid-cols-4 gap-4">
          <MetaBlock label="Campanhas no periodo" value={formatInteger(totalCampaigns)} />
          <MetaBlock
            label="Top campanhas exibidas"
            value={formatInteger(topCampaignSlice?.rows.length ?? 0)}
          />
          <MetaBlock
            label="Investimento consolidado"
            value={formatCurrency(metricsData?.totals.spend ?? 0)}
          />
          <MetaBlock
            label="Leads consolidados"
            value={formatInteger(metricsData?.totals.leads ?? 0)}
          />
        </div>

        {topCampaignSlice ? (
          <AccountCampaignBlock slice={topCampaignSlice} />
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-600">
            Nenhuma campanha foi encontrada para compor o relatorio.
          </div>
        )}
      </PageShell>

      {creativePages.length > 0 ? (
        creativePages.map((pageSlices, index) => (
          <PageShell
            key={`creative-page-${index}`}
            section="Criativos"
            title="Top criativos por conta"
            description="Pagina dedicada aos criativos retornados no dashboard, mantendo miniaturas e metricas principais em formato de relatorio."
            pageNumber={pageNumber++}
            pageCount={pageCount}
            icon={ImageIcon}
          >
            <div className="grid grid-cols-3 gap-4">
              <MetaBlock
                label="Paginas desta secao"
                value={`${index + 1} de ${creativePages.length}`}
              />
              <MetaBlock
                label="Criativos nesta pagina"
                value={formatInteger(
                  pageSlices.reduce((sum, slice) => sum + slice.creatives.length, 0),
                )}
              />
              <MetaBlock
                label="Total de criativos"
                value={formatInteger(totalCreatives)}
              />
            </div>

            <div className="space-y-5">
              {pageSlices.map((slice) => (
                <div
                  key={`${slice.accountId}-${slice.pageIndex}`}
                  className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className={`text-sm font-semibold text-slate-950 ${PDF_WRAP}`}>{slice.accountName}</div>
                      <div className={`mt-1 font-mono text-xs text-slate-500 ${PDF_WRAP}`}>{slice.accountValue}</div>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
                      Parte {slice.pageIndex} de {slice.totalPages}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {slice.creatives.map((creative) => (
                      <CreativeCard key={`${slice.accountId}-${creative.ad_id}`} creative={creative} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PageShell>
        ))
      ) : (
        <PageShell
          section="Criativos"
          title="Top criativos por conta"
          description="Nao ha criativos disponiveis para os filtros aplicados."
          pageNumber={pageNumber++}
          pageCount={pageCount}
          icon={ImageIcon}
        >
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-600">
            Nenhum criativo foi encontrado para compor o relatorio.
          </div>
        </PageShell>
      )}
    </div>
  );
}
