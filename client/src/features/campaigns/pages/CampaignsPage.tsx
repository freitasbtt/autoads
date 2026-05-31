import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignDetailsModal } from "@/components/CampaignDetailsModal";
import { Edit, RotateCcw, Trash2 } from "lucide-react";
import { CampaignStatusBadge } from "../components/CampaignStatusBadge";
import { useCampaignListData } from "../hooks/useCampaignListData";
import { useCampaignMutations } from "../hooks/useCampaignMutations";
import { useCampaignRealtime } from "../hooks/useCampaignRealtime";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

type CooldownPayload = {
  message?: string;
  cooldown_seconds?: number;
  cooldown_until?: string | null;
};

type CooldownErrorPayload = {
  message?: string;
  retry_after?: number;
};

const COOLDOWN_STORAGE_KEY = "campaignsCooldowns";
const normalizeAdAccountId = (value: string) => value.replace(/\D+/g, "").trim();

function parseCooldownError(error: unknown): CooldownErrorPayload | null {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return null;
  }

  const message = String((error as { message?: unknown }).message ?? "");
  const match = message.match(/^\s*(\d{3}):\s*(.*)$/s);
  if (!match) {
    return null;
  }

  const statusCode = Number(match[1]);
  if (statusCode !== 429) {
    return null;
  }

  const payloadText = match[2]?.trim();
  if (!payloadText) {
    return { message: "Aguarde antes de reenviar." };
  }

  try {
    return JSON.parse(payloadText) as CooldownErrorPayload;
  } catch {
    return { message: payloadText };
  }
}

export function CampaignsPage() {
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showSendButton, setShowSendButton] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const { campaigns, isLoading, resources, audiences } = useCampaignListData();
  const { deleteCampaign } = useCampaignMutations();
  useCampaignRealtime();
  const accountLookup = useMemo(() => {
    const map = new Map<number, { name: string; value: string }>();
    resources
      .filter((resource) => resource.type === "account")
      .forEach((resource) => {
        map.set(resource.id, { name: resource.name, value: resource.value });
      });
    return map;
  }, [resources]);
  const getCooldownKey = (campaign: Campaign | null | undefined) => {
    if (!campaign || typeof campaign.accountId !== "number") {
      return null;
    }
    const accountValue = accountLookup.get(campaign.accountId)?.value?.trim();
    const normalized = accountValue ? normalizeAdAccountId(accountValue) : "";
    return normalized || null;
  };

  const hasActiveCooldown = Object.values(cooldowns).some(
    (timestamp) => timestamp > cooldownNow,
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Record<string, number>;
      const now = Date.now();
      const normalized: Record<string, number> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        if (typeof value !== "number" || value <= now) {
          return;
        }
        const normalizedKey = normalizeAdAccountId(key);
        if (!normalizedKey) {
          return;
        }
        normalized[normalizedKey] = Math.max(normalized[normalizedKey] ?? 0, value);
      });
      if (Object.keys(normalized).length > 0) {
        setCooldowns(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const now = Date.now();
    const cleaned = Object.fromEntries(
      Object.entries(cooldowns).filter(
        ([, value]) => typeof value === "number" && value > now,
      ),
    );
    if (Object.keys(cleaned).length > 0) {
      window.localStorage.setItem(
        COOLDOWN_STORAGE_KEY,
        JSON.stringify(cleaned),
      );
    } else {
      window.localStorage.removeItem(COOLDOWN_STORAGE_KEY);
    }
  }, [cooldowns]);

  useEffect(() => {
    if (!hasActiveCooldown) {
      return;
    }
    const intervalId = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveCooldown]);

  const reprocessMutation = useMutation({
    mutationFn: async (payload: { campaignId: number }) => {
      const response = await apiRequest(
        "POST",
        `/api/campaigns/${payload.campaignId}/send-webhook`,
        {},
      );
      return (await response.json()) as CooldownPayload;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      const campaign = campaigns.find((item) => item.id === variables.campaignId);
      const accountKey = getCooldownKey(campaign);
      if (accountKey) {
        if (data?.cooldown_until) {
          const parsed = Date.parse(data.cooldown_until);
          if (Number.isFinite(parsed)) {
            setCooldowns((prev) => ({ ...prev, [accountKey]: parsed }));
          }
        } else if (typeof data?.cooldown_seconds === "number" && Number.isFinite(data.cooldown_seconds)) {
          setCooldowns((prev) => ({
            ...prev,
            [accountKey]: Date.now() + data.cooldown_seconds * 1000,
          }));
        }
      }
      toast({
        title: "Reprocessando",
        description: data?.message ?? "Campanha reenviada para n8n.",
      });
    },
    onError: (error: Error, variables) => {
      const cooldownError = parseCooldownError(error);
      const retryAfter = Number(cooldownError?.retry_after);
      const campaign = campaigns.find((item) => item.id === variables.campaignId);
      const accountKey = getCooldownKey(campaign);
      if (accountKey && Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldowns((prev) => ({
          ...prev,
          [accountKey]: Date.now() + retryAfter * 1000,
        }));
      }
      toast({
        title: cooldownError ? "Aguarde" : "Erro ao reprocessar",
        description: cooldownError?.message || error.message,
        variant: cooldownError ? "default" : "destructive",
      });
    },
  });

  const handleReprocess = (campaign: Campaign, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    reprocessMutation.mutate({ campaignId: campaign.id });
  };

  const handleRowClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setShowSendButton(false);
    setModalOpen(true);
  };

  const handleDelete = (campaignId: number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    deleteCampaign(campaignId);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Campanhas</h1>
          <p className="text-muted-foreground">
            Gerencie todas as suas campanhas Meta Ads
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando campanhas...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma campanha cadastrada</p>
            <p className="text-sm text-muted-foreground mt-2">
              Clique em &quot;Nova Campanha&quot; para criar sua primeira campanha
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Todas as Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Campanha
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Conta de anuncios
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b hover-elevate cursor-pointer"
                      data-testid={`row-campaign-${campaign.id}`}
                      onClick={() => handleRowClick(campaign)}
                    >
                      <td className="py-4 px-4 font-medium">#{campaign.id}</td>
                      <td className="py-4 px-4">
                        {(() => {
                          const account = campaign.accountId
                            ? accountLookup.get(campaign.accountId)
                            : null;
                          return (
                            <div>
                              <div className="font-medium">
                                {account?.name ?? "Conta nao encontrada"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                ID: {account?.value ?? "-"}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        <CampaignStatusBadge
                          status={campaign.status}
                          statusDetail={campaign.statusDetail}
                        />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end gap-1">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => handleReprocess(campaign, e)}
                              data-testid={`button-reprocess-campaign-${campaign.id}`}
                              title="Reprocessar"
                              disabled={(() => {
                                const accountKey = getCooldownKey(campaign);
                                const cooldownUntil = accountKey ? cooldowns[accountKey] : undefined;
                                const remainingSeconds = cooldownUntil
                                  ? Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000))
                                  : 0;
                                const isCooldownActive = remainingSeconds > 0;
                                const isProcessing =
                                  reprocessMutation.isPending &&
                                  reprocessMutation.variables?.campaignId === campaign.id;
                                const isCompleted = campaign.status === "completed";
                                return isCooldownActive || isProcessing || isCompleted;
                              })()}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            {(() => {
                              const accountKey = getCooldownKey(campaign);
                              const cooldownUntil = accountKey ? cooldowns[accountKey] : undefined;
                              const remainingSeconds = cooldownUntil
                                ? Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000))
                                : 0;
                              return remainingSeconds > 0 ? (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {remainingSeconds}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast({
                                title: "Em desenvolvimento",
                                description: "Edição de campanha em breve",
                              });
                            }}
                            data-testid={`button-edit-campaign-${campaign.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => handleDelete(campaign.id, e)}
                            data-testid={`button-delete-campaign-${campaign.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <CampaignDetailsModal
        campaign={selectedCampaign}
        open={modalOpen}
        onOpenChange={setModalOpen}
        resources={resources}
        audiences={audiences}
        showSendButton={showSendButton}
      />
    </div>
  );
}
