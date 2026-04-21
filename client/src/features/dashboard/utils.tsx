import type { DateRange } from "react-day-picker";
import { isSameDay, subDays } from "date-fns";

import type {
  CampaignHeaderSnapshot,
  DashboardCampaignMetrics,
  MetricTotals,
} from "./types";

export const EMPTY_TOTALS: MetricTotals = {
  spend: 0,
  resultSpend: 0,
  impressions: 0,
  clicks: 0,
  reach: 0,
  leads: 0,
  messagingConversationsStarted: 0,
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

const dateRangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatCurrency(v: number | null | undefined) {
  if (!v || !Number.isFinite(v)) return "R$ 0,00";
  return currencyFormatter.format(v);
}

export function formatInteger(v: number | null | undefined) {
  if (!v || !Number.isFinite(v)) return "0";
  return integerFormatter.format(v);
}

export function formatPercent(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

export function formatFrequency(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
}

export function renderPieSliceLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
}) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    outerRadius = 0,
    percent = 0,
  } = props;

  if (percent < 0.06) {
    return null;
  }

  const RADIAN = Math.PI / 180;
  const radius = outerRadius * 0.62;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-semibold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function getCTR(clicks: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

export function getCPM(spend: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (spend / impressions) * 1000;
}

export function getCostPerLead(spend: number, leads: number): number | null {
  if (!leads || leads <= 0) return null;
  return spend / leads;
}

export function buildDefaultRange(): DateRange {
  const end = new Date();
  const start = subDays(end, 29);
  return { from: start, to: end };
}

export function normalizeRange(range: DateRange | null): DateRange {
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

export function labelFromRange(r: DateRange): string {
  if (!r.from || !r.to) return "Selecione um período";
  const start = dateRangeFormatter.format(r.from).replace(/\./g, "");
  const end = dateRangeFormatter.format(r.to).replace(/\./g, "");
  return `${start} - ${end}`;
}

export function calcTrend(
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

export const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD: "Geração de Leads",
  TRAFFIC: "Tráfego",
  CONVERSIONS: "Conversões",
  REACH: "Alcance",
  WHATSAPP: "WhatsApp",
  SALES: "Vendas",
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Removida",
  DISCARDED: "Descartada",
};

export function getObjectiveLabel(v: string | null | undefined): string {
  if (!v) return "";
  const upper = v.toUpperCase();
  return OBJECTIVE_LABELS[upper] ?? upper;
}

export function getStatusLabel(v: string | null | undefined): string {
  if (!v) return "Status não informado";
  const upper = v.toUpperCase();
  return STATUS_LABELS[upper] ?? upper;
}

export function summarizeResult(
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
    (metrics.results && metrics.results > 0 ? metrics.results : null) ??
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

export function buildCampaignHeaderSnapshot(
  campaign: DashboardCampaignMetrics,
): CampaignHeaderSnapshot {
  const summary = summarizeResult(campaign.metrics, campaign.resultado);
  const ctr = getCTR(campaign.metrics.clicks, campaign.metrics.impressions);
  return {
    spend: campaign.metrics.spend,
    resultLabel: summary.label,
    resultQuantity: summary.quantidade,
    costPerResult: summary.custo,
    ctr,
  };
}

export function sameRange(a: DateRange, b: DateRange) {
  if (!a.from || !a.to || !b.from || !b.to) return false;
  return isSameDay(a.from, b.from) && isSameDay(a.to, b.to);
}
