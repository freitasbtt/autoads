import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

type TaskDistributionReviewProps = {
  taskId: string;
};

type PairView = {
  pairId: string;
  position: number;
  title: string | null;
  text: string | null;
  feedThumbnailUrl: string | null;
};

type AdsetRecord = {
  id: string;
  name: string | null;
};

type PairAssignmentRecord = {
  pairId: string;
  useCampaignDefault: boolean;
  leadgenFormId: string | null;
  leadgenFormName: string | null;
};

type DestinationRecord = {
  resourceId: number;
  adAccountId: string;
  adAccountName: string;
  campaign: {
    id: string;
    name: string | null;
    objective: string | null;
    status: string | null;
  };
  adsets: AdsetRecord[];
  applyToAllAdsets: boolean;
  selectedAdsetIds: string[];
  pairIds: string[];
  campaignLeadgenFormId: string | null;
  campaignLeadgenFormName: string | null;
  pairAssignments: PairAssignmentRecord[];
  createAdsStatus: "PAUSED" | "ACTIVE";
};

type DistributionState = {
  destinations: DestinationRecord[];
};

type DistributionDetail = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  pairs: PairView[];
  distribution: DistributionState;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Nao informado";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getSelectedAdsets(destination: DestinationRecord) {
  return destination.applyToAllAdsets
    ? destination.adsets
    : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));
}

function PairThumb({ pair }: { pair: PairView }) {
  if (!pair.feedThumbnailUrl) {
    return (
      <div className="flex h-12 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[10px] text-slate-500">
        Feed
      </div>
    );
  }

  return (
    <img
      src={pair.feedThumbnailUrl}
      alt=""
      className="h-12 w-10 rounded-lg object-cover"
    />
  );
}

export default function TaskDistributionReviewPage({ taskId }: TaskDistributionReviewProps) {
  const [, navigate] = useLocation();
  const [expandedAdsetsByCampaign, setExpandedAdsetsByCampaign] = useState<Record<string, boolean>>({});

  const detailQuery = useQuery<DistributionDetail>({
    queryKey: [`/api/tasks/${taskId}/distribution`],
  });

  const sendToN8nMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/distribution/send`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tasks/${taskId}/distribution`] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Envio iniciado",
        description: "A configuracao foi enviada ao n8n com sucesso.",
      });
      navigate("/tasks");
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao publicar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const detail = detailQuery.data;
  const pairs = detail?.pairs ?? [];

  const pairById = useMemo(() => {
    return new Map(pairs.map((pair) => [pair.pairId, pair]));
  }, [pairs]);

  function toggleExpandedAdsets(campaignKey: string) {
    setExpandedAdsetsByCampaign((current) => ({
      ...current,
      [campaignKey]: !current[campaignKey],
    }));
  }

  const reviewDestinations = useMemo(() => {
    return (detail?.distribution.destinations ?? []).filter((destination) => {
      const adsetCount = destination.applyToAllAdsets
        ? destination.adsets.length
        : destination.selectedAdsetIds.length;
      return destination.pairIds.length > 0 && adsetCount > 0;
    });
  }, [detail?.distribution.destinations]);

  const accountGroups = useMemo(() => {
    const grouped = new Map<
      number,
      {
        resourceId: number;
        adAccountId: string;
        adAccountName: string;
        campaigns: DestinationRecord[];
      }
    >();

    reviewDestinations.forEach((destination) => {
      const current = grouped.get(destination.resourceId) ?? {
        resourceId: destination.resourceId,
        adAccountId: destination.adAccountId,
        adAccountName: destination.adAccountName,
        campaigns: [],
      };
      current.campaigns.push(destination);
      grouped.set(destination.resourceId, current);
    });

    return Array.from(grouped.values());
  }, [reviewDestinations]);

  const uniquePairIds = useMemo(() => {
    return Array.from(new Set(reviewDestinations.flatMap((destination) => destination.pairIds))).filter((pairId) =>
      pairById.has(pairId),
    );
  }, [pairById, reviewDestinations]);

  const adsetCount = useMemo(() => {
    return reviewDestinations.reduce((total, destination) => {
      return total + getSelectedAdsets(destination).length;
    }, 0);
  }, [reviewDestinations]);

  const jobCount = useMemo(() => {
    return reviewDestinations.reduce((total, destination) => {
      return total + getSelectedAdsets(destination).length * destination.pairIds.length;
    }, 0);
  }, [reviewDestinations]);

  const errors = useMemo(() => {
    const items: string[] = [];

    if (
      reviewDestinations.some((destination) => {
        return getSelectedAdsets(destination).length === 0;
      })
    ) {
      items.push("Existe campanha sem conjunto de anuncio selecionado.");
    }

    if (jobCount === 0) {
      items.push("Nao ha jobs suficientes para publicar.");
    }

    return items;
  }, [jobCount, reviewDestinations]);

  if (detailQuery.isLoading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-6 text-sm text-slate-500">Carregando revisao...</CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <Card className="border-rose-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="text-sm text-rose-700">Nao foi possivel carregar a revisao desta tarefa.</div>
            <Button variant="outline" onClick={() => navigate(`/tasks/${taskId}/distribution`)}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-slate-900">Revisao final</CardTitle>
            <CardDescription className="text-slate-600">
              Valide a configuracao final antes de publicar no n8n.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Tarefa</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{detail.title}</div>
              <div className="mt-1 text-xs text-slate-500">Atualizada em {formatDateTime(detail.updatedAt)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Contas</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{accountGroups.length}</div>
              <div className="mt-1 text-xs text-slate-500">conta(s) selecionada(s)</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Campanhas</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{reviewDestinations.length}</div>
              <div className="mt-1 text-xs text-slate-500">campanha(s) com pares</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Pares e conjuntos</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {uniquePairIds.length} pares
              </div>
              <div className="mt-1 text-xs text-slate-500">{adsetCount} conjunto(s)</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Jobs</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{jobCount}</div>
              <div className="mt-1 text-xs text-slate-500">anuncio(s) a enviar</div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900">Contas, campanhas e pares</CardTitle>
            </CardHeader>
            <CardContent>
              {accountGroups.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhuma configuracao pronta para envio. Volte e atribua pares a pelo menos uma campanha.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto pr-3">
                  <div className="space-y-4">
                    {accountGroups.map((accountGroup) => (
                      <div key={accountGroup.resourceId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Conta de anuncios</div>
                            <div className="mt-1 text-sm text-slate-700">{accountGroup.adAccountName}</div>
                            <div className="text-xs text-slate-500">{accountGroup.adAccountId}</div>
                          </div>
                          <Badge variant="outline" className="bg-white">
                            {accountGroup.campaigns.length} campanha(s)
                          </Badge>
                        </div>

                        <div className="mt-4 space-y-3">
                          {accountGroup.campaigns.map((destination) => {
                            const selectedAdsets = getSelectedAdsets(destination);
                            const campaignKey = `${destination.resourceId}:${destination.campaign.id}`;
                            const showAllAdsets = expandedAdsetsByCampaign[campaignKey] === true;
                            const visibleAdsets = showAllAdsets ? selectedAdsets : selectedAdsets.slice(0, 3);
                            const hiddenAdsetCount = Math.max(selectedAdsets.length - visibleAdsets.length, 0);

                            return (
                              <div
                                key={campaignKey}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      Campanha
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">
                                      {destination.campaign.name ?? destination.campaign.id}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {destination.campaign.objective ?? "Sem objetivo"} | {selectedAdsets.length} conjunto(s) |{" "}
                                      {destination.pairIds.length} par(es)
                                    </div>
                                  </div>
                                  <Badge variant="outline">{destination.createAdsStatus}</Badge>
                                </div>

                                <div className="mt-3 space-y-3">
                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="space-y-2">
                                      {visibleAdsets.map((adset, index) => (
                                        <div key={adset.id} className="flex items-center gap-2 text-sm text-slate-700">
                                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                                          <span className="truncate">
                                            {adset.name ?? `Conjunto ${index + 1}`}
                                          </span>
                                        </div>
                                      ))}

                                      {hiddenAdsetCount > 0 ? (
                                        <button
                                          type="button"
                                          className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                                          onClick={() => toggleExpandedAdsets(campaignKey)}
                                        >
                                          +{hiddenAdsetCount}
                                        </button>
                                      ) : selectedAdsets.length > 3 ? (
                                        <button
                                          type="button"
                                          className="inline-flex h-7 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                                          onClick={() => toggleExpandedAdsets(campaignKey)}
                                        >
                                          Recolher
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Criativos</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {destination.pairIds.map((pairId) => {
                                        const pair = pairById.get(pairId);
                                        if (!pair) {
                                          return null;
                                        }

                                        const pairAssignment =
                                          destination.pairAssignments.find((assignment) => assignment.pairId === pairId) ?? null;

                                        return (
                                          <div
                                            key={pairId}
                                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
                                          >
                                            <PairThumb pair={pair} />
                                            <div className="min-w-0">
                                              <div className="text-sm font-medium text-slate-900">
                                                Par {String(pair.position + 1).padStart(2, "0")}
                                              </div>
                                              <div className="max-w-[220px] truncate text-[11px] text-slate-500">
                                                {pairAssignment?.useCampaignDefault === false
                                                  ? pairAssignment.leadgenFormName ??
                                                    pairAssignment.leadgenFormId ??
                                                    "Ultimo formulario da pagina"
                                                  : destination.campaignLeadgenFormName ??
                                                    destination.campaignLeadgenFormId ??
                                                    "Ultimo formulario da pagina"}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="flex justify-end gap-2 p-5">
              <Button variant="outline" onClick={() => navigate(`/tasks/${taskId}/distribution`)}>
                Voltar
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => sendToN8nMutation.mutate()}
                disabled={sendToN8nMutation.isPending || accountGroups.length === 0 || errors.length > 0}
              >
                {sendToN8nMutation.isPending ? "Publicando..." : "Publicar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
