"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ------------------------------------------
 * Tipos herdados do Dashboard
 * ------------------------------------------ */

type MetricTotals = {
  spend: number;
  resultSpend: number;
  impressions: number;
  clicks: number;
  leads: number;
  results: number;
  costPerResult: number | null;
};

export type DashboardCampaignMetrics = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  metrics: MetricTotals;
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
};

export type CampaignHeaderSnapshot = {
  spend: number;
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  ctr: number | null;
};

/* ------------------------------------------
 * Tipo vindo do backend em /api/meta/campaigns/:id/creatives
 * Cada item = 1 anúncio individual (ad)
 * ------------------------------------------ */
type CampaignAdReport = {
  ad_id: string;
  ad_name: string | null;
  creative_id: string | null;
  thumbnailUrl: string | null;
  metrics: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number | null;
    resultQty: number;
    costPerResult: number | null;
  };
};

/* ------------------------------------------
 * Props
 * ------------------------------------------ */
interface CampaignCreativesDialogProps {
  open: boolean;
  onClose: () => void;

  campaign: DashboardCampaignMetrics | null;
  account: string | null; // ex: "act_1234"
  headerSnapshot: CampaignHeaderSnapshot | null;

  startDate: string; // "yyyy-MM-dd"
  endDate: string;   // "yyyy-MM-dd"
}

/* ------------------------------------------
 * Helpers de formatação
 * ------------------------------------------ */

// R$ 55,56
function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// 5,3 mil / 320 / —
function formatImpressions(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 1000) {
    // ex: 5300 -> "5,3 mil"
    const milhares = n / 1000;
    return `${milhares.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mil`;
  }
  return n.toLocaleString("pt-BR");
}

// inteiro simples (Resultados, Cliques)
function formatInt(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR");
}

// CTR 3.50%
function formatCTR(v: number | null | undefined) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${v.toFixed(2)}%`;
}

/* ------------------------------------------
 * Componente principal
 * ------------------------------------------ */
export function CampaignCreativesDialog({
  open,
  onClose,
  campaign,
  account,
  headerSnapshot,
  startDate,
  endDate,
}: CampaignCreativesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creatives, setCreatives] = useState<CampaignAdReport[]>([]);

  const canRequest = !!campaign?.id && !!account;

  // Info de topo do modal (header principal)
  const headerInfo = useMemo(() => {
    if (!campaign || !headerSnapshot) return null;

    return {
      id: campaign.id,
      name: campaign.name ?? `Campanha ${campaign.id}`,
      objective: campaign.objective ?? null,
      status: campaign.status ?? null,
      spend: headerSnapshot.spend,
      resultLabel: headerSnapshot.resultLabel,
      resultQuantity: headerSnapshot.resultQuantity,
      costPerResult: headerSnapshot.costPerResult,
      ctr: headerSnapshot.ctr,
    };
  }, [campaign, headerSnapshot]);

  // Carrega anúncios (criativos) quando abre
  useEffect(() => {
    if (!open || !canRequest) return;

    async function loadCreatives() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const params = new URLSearchParams({
          accountId: account ?? "",
          startDate,
          endDate,
        });

        const res = await fetch(
          `/api/meta/campaigns/${encodeURIComponent(
            campaign!.id,
          )}/creatives?` + params.toString(),
        );

        if (!res.ok) {
          const text = await res.text();
          try {
            const maybeJson = JSON.parse(text);
            setErrorMsg(
              maybeJson?.message ||
                `Erro ${res.status} ao carregar criativos.`,
            );
          } catch {
            setErrorMsg(
              "Não foi possível carregar os criativos. A API respondeu um erro inesperado.",
            );
          }
          setCreatives([]);
          return;
        }

        let data: any;
        try {
          data = await res.json();
        } catch {
          setErrorMsg(
            "A API retornou um conteúdo não-JSON. Verifique se /api/meta/campaigns/:id/creatives está retornando JSON.",
          );
          setCreatives([]);
          return;
        }

        if (!data || !Array.isArray(data.creatives)) {
          setErrorMsg(
            "Resposta inesperada da API. Campo 'creatives' ausente.",
          );
          setCreatives([]);
          return;
        }

        setCreatives(data.creatives as CampaignAdReport[]);
      } catch (err: any) {
        setErrorMsg(
          err?.message ?? "Erro desconhecido ao carregar criativos.",
        );
        setCreatives([]);
      } finally {
        setLoading(false);
      }
    }

    loadCreatives();
  }, [open, canRequest, account, campaign, startDate, endDate]);

  /* ------------------------------------------
   * Render helpers
   * ------------------------------------------ */

  function CreativeMetricsGrid({
    spend,
    impressions,
    clicks,
    results,
    costPerResult,
    ctr,
  }: {
    spend: number | null | undefined;
    impressions: number | null | undefined;
    clicks: number | null | undefined;
    results: number | null | undefined;
    costPerResult: number | null | undefined;
    ctr: number | null | undefined;
  }) {
    const cells = [
      { label: "Investimento", value: formatMoney(spend) },
      { label: "Impressões", value: formatImpressions(impressions as number) },
      { label: "Cliques", value: formatInt(clicks as number) },
      { label: "CTR", value: formatCTR(ctr) },
      { label: "Resultados", value: formatInt(results as number) },
      { label: "Custo / Resultado", value: formatMoney(costPerResult) },
    ];

    return (
      <div className="grid grid-cols-2 gap-3 border-t bg-muted/30 p-4 text-xs md:text-[0.8rem]">
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className="rounded-md border bg-card px-3 py-2 text-left shadow-sm"
          >
            <div className="text-[0.65rem] font-medium text-muted-foreground leading-none">
              {cell.label}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground leading-tight">
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function CreativeCard(item: CampaignAdReport) {
    const m = item.metrics;

    return (
      <div className="flex flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        {/* Header textual do criativo */}
        <div className="border-b bg-card/40 p-4">
          <div className="text-[0.8rem] font-semibold text-foreground leading-tight">
            {item.ad_name
              ? item.ad_name
              : "Peça criativa veiculada nesse período"}
          </div>
          <div className="text-[0.7rem] text-muted-foreground leading-tight">
            Peça criativa veiculada nesse período
          </div>
        </div>

        {/* Preview grande da peça */}
        <div className="flex items-center justify-center p-4">
          <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {item.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnailUrl}
                alt="preview do criativo"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* KPIs do criativo */}
        <CreativeMetricsGrid
          spend={m.spend}
          impressions={m.impressions}
          clicks={m.clicks}
          results={m.resultQty}
          costPerResult={m.costPerResult}
          ctr={m.ctr}
        />
      </div>
    );
  }

  /* ------------------------------------------
   * Header do modal (topo)
   * ------------------------------------------ */

  function ModalHeader() {
    return (
      <DialogHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <DialogTitle className="text-base font-semibold leading-tight text-foreground">
                Desempenho das Peças Criativas
              </DialogTitle>

              {headerInfo ? (
                <>
                  <div className="text-sm font-medium text-foreground leading-tight break-words">
                    {headerInfo.name}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[0.7rem] leading-tight text-muted-foreground">
                    {headerInfo.objective && (
                      <Badge
                        variant="outline"
                        className="rounded-sm border px-2 py-0.5 text-[0.6rem] font-medium"
                      >
                        {headerInfo.objective}
                      </Badge>
                    )}
                    {headerInfo.status && (
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-2 py-0.5 text-[0.6rem] font-medium"
                      >
                        {headerInfo.status}
                      </Badge>
                    )}
                  </div>

                  <div className="text-[0.7rem] leading-tight text-muted-foreground">
                    Período analisado: {startDate} → {endDate}
                  </div>
                </>
              ) : (
                <div className="text-[0.7rem] leading-tight text-muted-foreground">
                  Nenhuma campanha selecionada.
                </div>
              )}
            </div>

            {/* KPIs gerais da campanha */}
            {headerInfo && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[0.7rem] leading-tight">
                <div className="rounded-md border bg-card px-2 py-2 shadow-sm">
                  <div className="text-muted-foreground text-[0.6rem] font-medium leading-none">
                    Investimento
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground leading-tight">
                    {formatMoney(headerInfo.spend)}
                  </div>
                </div>

                <div className="rounded-md border bg-card px-2 py-2 shadow-sm">
                  <div className="text-muted-foreground text-[0.6rem] font-medium leading-none">
                    {headerInfo.resultLabel}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground leading-tight">
                    {formatInt(headerInfo.resultQuantity)}
                  </div>
                </div>

                <div className="rounded-md border bg-card px-2 py-2 shadow-sm">
                  <div className="text-muted-foreground text-[0.6rem] font-medium leading-none">
                    Custo / Resultado
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground leading-tight">
                    {formatMoney(headerInfo.costPerResult)}
                  </div>
                </div>

                <div className="rounded-md border bg-card px-2 py-2 shadow-sm">
                  <div className="text-muted-foreground text-[0.6rem] font-medium leading-none">
                    CTR
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground leading-tight">
                    {formatCTR(headerInfo.ctr)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botão fechar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 flex-shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>
    );
  }

  /* ------------------------------------------
   * Render principal do modal
   * ------------------------------------------ */

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-hidden p-0">
        {/* HEADER */}
        <ModalHeader />

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando criativos…</span>
            </div>
          ) : errorMsg ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-center text-sm text-destructive">
              <div className="font-medium">
                Não foi possível carregar os criativos
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {errorMsg}
              </div>
              <div className="mt-3 text-[0.7rem] leading-tight text-muted-foreground">
                Verifique se a conta selecionada realmente tem anúncios
                veiculados nessa campanha no período informado
                e se a integração Meta tem permissão de leitura de anúncios
                e insights (por exemplo, ads_read e métricas de lead / mensagens).
              </div>
            </div>
          ) : creatives.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma peça criativa veiculada nesse período.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {creatives.map((item) => (
                <CreativeCard
                  key={item.ad_id ?? item.creative_id ?? Math.random().toString(36)}
                  {...item}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
