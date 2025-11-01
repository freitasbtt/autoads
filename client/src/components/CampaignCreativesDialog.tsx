"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* -------------------------------------------------
 * Tipos compartilhados (os mesmos do dashboard)
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

type CampaignAdsetResumo = {
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
};

type ResultadoDetalhe = {
  tipo: string;
  label: string;
  quantidade: number;
  custo_por_resultado: number | null;
};

type ResultadoCampanha = {
  label: string;
  quantidade: number | null;
  custo_por_resultado: number | null;
  optimization_goal?: string | null;
  detalhes?: ResultadoDetalhe[];
  adsets?: CampaignAdsetResumo[];
};

export type DashboardCampaignMetrics = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  metrics: MetricTotals;
  resultado?: ResultadoCampanha;
};

export type CampaignHeaderSnapshot = {
  spend: number;
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  ctr: number | null;
};

/* -------------------------------------------------
 * Tipos específicos de criativos
 * ------------------------------------------------- */

interface CreativeAsset {
  id: string;
  label: string;
  url: string | null;
  thumbnailUrl: string | null;
}

interface CreativePerformance {
  impressions: number;
  clicks: number;
  spend: number;
  results: number;
  costPerResult: number | null;
}

export interface CampaignCreative {
  id: string;
  name: string | null;
  thumbnailUrl: string | null;
  assets: CreativeAsset[];
  performance: CreativePerformance;
}

type CampaignCreativesResponse = {
  creatives: CampaignCreative[];
};

/* -------------------------------------------------
 * Helpers de formatação
 * ------------------------------------------------- */

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/D";
  return currencyFormatter.format(value);
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/D";
  return integerFormatter.format(value);
}

function calcCTR(clicks: number, impressions: number): number | null {
  if (!impressions || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

function formatPercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

// pega a primeira palavra do label da campanha (ex: "Conversas" -> "conversas")
function getUnitFromLabel(label: string | undefined | null) {
  if (!label) return "res";
  const first = label.trim().split(/\s+/)[0] ?? "res";
  return first.toLowerCase();
}

/**
 * Constrói o resumo da campanha usando SOMENTE dados que já vêm do dashboard.
 */
function buildResumoCampanha(campaign: DashboardCampaignMetrics) {
  const m = campaign.metrics;
  const r = campaign.resultado;

  let labelResultado = "Resultado";
  let qtdResultado: number | null = null;
  let custoResultado: number | null = null;

  if (r && r.quantidade !== null) {
    labelResultado = r.label || "Resultado";
    qtdResultado = r.quantidade ?? null;
    custoResultado = r.custo_por_resultado ?? null;
  } else {
    const rawQty =
      (Number.isFinite(m.results) && m.results > 0 ? m.results : null) ??
      (Number.isFinite(m.leads) && m.leads > 0 ? m.leads : null) ??
      null;

    qtdResultado = rawQty;
    labelResultado = r?.label || "Resultado";

    const fallbackCost =
      m.costPerResult ?? (rawQty && rawQty > 0 ? m.resultSpend / rawQty : null);

    custoResultado = fallbackCost ?? null;
  }

  const ctr = calcCTR(m.clicks, m.impressions);

  return {
    gasto: m.spend ?? 0,
    labelResultado,
    qtdResultado,
    custoResultado,
    ctr,
  };
}

/* -------------------------------------------------
 * Subcomponentes de UI
 * ------------------------------------------------- */

function StatItem({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex flex-col text-right">
      <span className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <span className="text-sm font-semibold leading-tight text-foreground">
        {value}
        {helper ? (
          <span className="ml-1 text-[0.6rem] font-normal text-muted-foreground/70">
            {helper}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function DetailPill({
  quantidade,
  label,
  custo,
  unit,
}: {
  quantidade: number;
  label: string;
  custo: number | null | undefined;
  unit: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-1 text-[0.6rem] font-medium leading-none text-muted-foreground ring-1 ring-border/60">
      <span className="text-[0.7rem] font-semibold text-foreground">
        {quantidade.toLocaleString("pt-BR")}
      </span>
    </span>
  );
}

function MetricRow({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground/80">
        {title}
      </dt>
      <dd
        className={
          "text-sm font-semibold leading-tight " +
          (accent ? "text-foreground" : "text-foreground/90")
        }
      >
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------
 * Card de Criativo
 * ------------------------------------------------- */

function CreativeBlock({
  creative,
  resultadoLabel,
  resultadoQuantidadeFromDash,
  custoPorResultadoFromDash,
  unit,
  detailRows,
}: {
  creative: CampaignCreative;
  resultadoLabel: string;
  resultadoQuantidadeFromDash: number | null;
  custoPorResultadoFromDash: number | null;
  unit: string;
  detailRows: ResultadoDetalhe[];
}) {
  const ctr = calcCTR(
    creative.performance.clicks,
    creative.performance.impressions,
  );

  const mainAsset = creative.assets[0];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 to-card shadow-sm ring-1 ring-black/5 transition-colors hover:bg-card hover:shadow-lg hover:ring-black/10">
      {/* BARRA SUPERIOR */}
      <header className="flex items-start justify-between bg-muted/40/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-col gap-1 pr-4">
          <p className="max-w-[16rem] truncate text-sm font-semibold leading-tight text-foreground">
            {creative.name ?? "Criativo sem nome"}
          </p>
          <p className="text-[0.65rem] font-mono leading-none text-muted-foreground/80">
            ID: {creative.id}
          </p>
        </div>

        {/* Badge do resultado principal da campanha */}
        <div className="rounded-lg bg-background/60 px-2 py-1 text-right shadow-sm ring-1 ring-border/60">
          <div className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground/80">
            {resultadoLabel}
          </div>
          <div className="text-sm font-semibold leading-tight text-foreground">
            {resultadoQuantidadeFromDash !== null
              ? resultadoQuantidadeFromDash.toLocaleString("pt-BR")
              : "N/D"}
          </div>
        </div>
      </header>

      {/* CORPO */}
      <div className="grid gap-4 p-4 md:grid-cols-[auto,1fr]">
        {/* PREVIEW VISUAL */}
        <div className="flex flex-col items-center rounded-xl border border-border/60 bg-background/40 p-4 text-center ring-1 ring-black/5">
          {mainAsset?.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainAsset.thumbnailUrl}
              alt={mainAsset.label}
              className="h-32 w-32 rounded-md object-cover shadow-sm ring-1 ring-border/80"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-border/60 text-[0.7rem] text-muted-foreground">
              Preview
            </div>
          )}

          <span className="mt-3 max-w-[8rem] truncate text-[0.7rem] text-muted-foreground/90">
            {mainAsset?.label ?? "Preview"}
          </span>
        </div>

        {/* MÉTRICAS DO CRIATIVO */}
        <div className="flex flex-col rounded-xl bg-muted/10 p-4 text-[0.7rem] shadow-inner ring-1 ring-inset ring-border/40">
          {/* GRID DE MÉTRICAS PRIMÁRIAS */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-foreground">
            <MetricRow
              title="Impressões"
              value={creative.performance.impressions.toLocaleString("pt-BR")}
            />

            <MetricRow
              title="Cliques"
              value={creative.performance.clicks.toLocaleString("pt-BR")}
            />

            <MetricRow
              title="Gasto"
              value={creative.performance.spend.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            />

            <MetricRow
              title={`Custo/${unit}`}
              value={
                custoPorResultadoFromDash !== null
                  ? custoPorResultadoFromDash.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "N/D"
              }
              accent
            />

            <MetricRow title="CTR" value={formatPercentage(ctr)} />
          </dl>

          {/* DIVISOR */}
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------
 * MODAL PRINCIPAL
 * ------------------------------------------------- */

export interface CampaignCreativesDialogProps {
  open: boolean;
  onClose: () => void;

  campaign: DashboardCampaignMetrics | null;
  account: string | null; // ID da conta ex: "act_123"
  headerSnapshot: CampaignHeaderSnapshot | null;

  startDate: string;
  endDate: string;
}

export function CampaignCreativesDialog({
  open,
  onClose,
  campaign,
  account,
  headerSnapshot,
  startDate,
  endDate,
}: CampaignCreativesDialogProps) {
  const enabled = open && !!campaign && !!account;

  const { data, isLoading, isError, error, refetch } = useQuery<
    CampaignCreativesResponse,
    Error
  >({
    queryKey: [
      "campaign-creatives",
      campaign?.id,
      account,
      startDate,
      endDate,
    ],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!campaign || !account) {
        return { creatives: [] };
      }

      const params = new URLSearchParams({
        accountId: account,
        startDate,
        endDate,
      });

      const res = await fetch(
        `/api/meta/campaigns/${encodeURIComponent(
          campaign.id,
        )}/creatives?${params.toString()}`,
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Falha ao carregar criativos desta campanha.");
      }

      return (await res.json()) as CampaignCreativesResponse;
    },
  });

  const resumo = useMemo(() => {
    return campaign ? buildResumoCampanha(campaign) : null;
  }, [campaign]);

  const detailRows = useMemo(() => {
    const raw = campaign?.resultado?.detalhes ?? [];
    return raw.filter((d) => d.quantidade && d.quantidade > 0);
  }, [campaign]);

  const resultadoLabelFromDashboard =
    campaign?.resultado?.label ?? resumo?.labelResultado ?? "Resultado";

  const resultadoQuantidadeFromDash = resumo?.qtdResultado ?? null;
  const custoPorResultadoFromDash = resumo?.custoResultado ?? null;
  const unitForDetailRows = getUnitFromLabel(resultadoLabelFromDashboard);

  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-6xl overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-background/95 to-background/80 p-0 shadow-2xl ring-1 ring-black/40 backdrop-blur-md">
        {/* HEADER */}
        <DialogHeader className="border-b border-border/60 bg-card/60 p-4 pb-3 backdrop-blur-md">
          <DialogTitle className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            {/* ESQUERDA: título e período */}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold leading-tight text-foreground md:text-lg">
                {campaign?.name ?? "Campanha sem nome"}
              </span>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] font-medium leading-none text-muted-foreground/80">
                <span className="uppercase tracking-wide">
                  {resultadoLabelFromDashboard}
                </span>
                <span className="text-muted-foreground/50">•</span>
                <span className="font-mono">
                  {startDate} → {endDate}
                </span>
              </div>

              {/* badges de breakdown de resultado principais no header */}
              {detailRows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {detailRows.map((detail) => (
                    <DetailPill
                      key={`${campaign?.id}-${detail.tipo ?? detail.label}`}
                      quantidade={detail.quantidade}
                      label={detail.label}
                      custo={detail.custo_por_resultado}
                      unit={getUnitFromLabel(detail.label)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* DIREITA: snapshot executivo */}
            {resumo && (
              <div className="min-w-[15rem] shrink-0 flex-col rounded-xl bg-background/60 p-4 shadow-sm ring-1 ring-border/60">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-[0.7rem] text-foreground md:grid-cols-2">
                  <StatItem
                    label="Gasto"
                    value={formatCurrency(resumo.gasto)}
                  />

                  <StatItem
                    label={resumo.labelResultado}
                    value={formatInteger(resumo.qtdResultado)}
                  />

                  <StatItem
                    label={`Custo/${unitForDetailRows}`}
                    value={formatCurrency(resumo.custoResultado)}
                  />

                  <StatItem
                    label="CTR"
                    value={formatPercentage(resumo.ctr)}
                  />
                </div>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* BODY */}
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
          {!enabled ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dados…
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando criativos…
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive shadow-sm ring-1 ring-black/5">
              <p className="mb-2">
                {error?.message ?? "Não foi possível carregar os criativos."}
              </p>
              <button
                type="button"
                className="text-xs font-semibold underline"
                onClick={() => refetch()}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data?.creatives && data.creatives.length > 0 ? (
                data.creatives.map((creative) => (
                  <CreativeBlock
                    key={creative.id}
                    creative={creative}
                    resultadoLabel={resultadoLabelFromDashboard}
                    resultadoQuantidadeFromDash={resultadoQuantidadeFromDash}
                    custoPorResultadoFromDash={custoPorResultadoFromDash}
                    unit={unitForDetailRows}
                    detailRows={detailRows}
                  />
                ))
              ) : (
                <section className="col-span-full rounded-2xl border border-border/60 bg-card/40 p-4 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-black/5">
                  Nenhum criativo encontrado para esta campanha no período.
                </section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
