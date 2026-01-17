import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Campaign, Resource, Audience } from "@shared/schema";
import { Calendar, Target, DollarSign, Send, CheckCircle, XCircle, Clock, FileText, RotateCcw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

type CooldownPayload = {
  cooldown_seconds?: number;
  cooldown_until?: string | null;
};

type CooldownErrorPayload = {
  message?: string;
  retry_after?: number;
};

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
    return { message: "Aguarde antes de enviar novamente." };
  }

  try {
    return JSON.parse(payloadText) as CooldownErrorPayload;
  } catch {
    return { message: payloadText };
  }
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface CampaignDetailsModalProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources?: Resource[];
  audiences?: Audience[];
  showSendButton?: boolean;
}

export function CampaignDetailsModal({
  campaign,
  open,
  onOpenChange,
  resources = [],
  audiences = [],
  showSendButton = false,
}: CampaignDetailsModalProps) {
  const { toast } = useToast();
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = Math.max(0, cooldownUntil - Date.now());
      setCooldownRemaining(remainingMs);
      if (remainingMs <= 0) {
        setCooldownUntil(null);
      }
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [cooldownUntil]);

  const sendMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/send-webhook`, {});
      try {
        return (await response.json()) as CooldownPayload;
      } catch {
        return {} as CooldownPayload;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (data?.cooldown_until) {
        const parsed = Date.parse(data.cooldown_until);
        if (Number.isFinite(parsed)) {
          setCooldownUntil(parsed);
        }
      } else if (typeof data?.cooldown_seconds === "number" && Number.isFinite(data.cooldown_seconds)) {
        setCooldownUntil(Date.now() + data.cooldown_seconds * 1000);
      }
      toast({
        title: "Enviado!",
        description: "Campanha enviada para automação com sucesso.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      const cooldownError = parseCooldownError(error);
      const retryAfter = Number(cooldownError?.retry_after);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldownUntil(Date.now() + retryAfter * 1000);
      }
      toast({
        title: cooldownError ? "Aguarde" : "Erro ao enviar",
        description:
          cooldownError?.message ||
          error.message ||
          "Não foi possível enviar para automação.",
        variant: cooldownError ? "default" : "destructive",
      });
    },
  });

  if (!campaign) return null;

  const getResourceName = (id: number | null) => {
    if (!id) return "Não definido";
    const resource = resources.find((r) => r.id === id);
    return resource ? resource.name : "Não encontrado";
  };

  const getStatusBadge = () => {
    switch (campaign.status) {
      case "draft":
        return (
          <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-status-draft">
            <FileText className="h-3 w-3" />
            Rascunho
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" data-testid="badge-status-pending">
            <Clock className="h-3 w-3 animate-spin" />
            Processando
          </Badge>
        );
      case "active":
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-green-500/10 text-green-700 dark:text-green-400" data-testid="badge-status-active">
            <CheckCircle className="h-3 w-3" />
            Ativa
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-status-error">
            <XCircle className="h-3 w-3" />
            Erro
          </Badge>
        );
      default:
        return <Badge variant="outline" data-testid="badge-status-default">{campaign.status}</Badge>;
    }
  };

  const adSets = campaign.adSets as any[] | null;
  const creatives = campaign.creatives as any[] | null;
  const showReprocessButton = campaign.status !== "draft" || !showSendButton;
  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
  const isCooldownActive = cooldownSeconds > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="modal-campaign-details">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl" data-testid="text-campaign-name">{campaign.name}</DialogTitle>
            {getStatusBadge()}
          </div>
          <DialogDescription>
            Detalhes da campanha e configurações
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configuração da Campanha */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Configuração da Campanha
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Conta Meta Ads:</span>
                <p className="font-medium" data-testid="text-account">{getResourceName(campaign.accountId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Objetivo:</span>
                <p className="font-medium" data-testid="text-objective">{campaign.objective}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Página:</span>
                <p className="font-medium" data-testid="text-page">{getResourceName(campaign.pageId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Instagram:</span>
                <p className="font-medium" data-testid="text-instagram">{getResourceName(campaign.instagramId)}</p>
              </div>
              {campaign.whatsappId && (
                <div>
                  <span className="text-muted-foreground">WhatsApp:</span>
                  <p className="font-medium" data-testid="text-whatsapp">{getResourceName(campaign.whatsappId)}</p>
                </div>
              )}
              {campaign.leadformId && (
                <div>
                  <span className="text-muted-foreground">Formulário de Leads:</span>
                  <p className="font-medium" data-testid="text-leadform">{getResourceName(campaign.leadformId)}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Conjuntos de Anúncios */}
          {adSets && adSets.length > 0 && (
            <>
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Conjuntos de Anúncios
                </h3>
                <div className="space-y-4">
                  {adSets.map((adSet, index) => {
                    const audience = audiences.find((a) => a.id === adSet.audienceId);
                    return (
                      <div key={index} className="border rounded-lg p-4" data-testid={`adset-${index}`}>
                        <h4 className="font-medium mb-2">Conjunto {index + 1}</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Público:</span>
                            <p className="font-medium">{audience?.name || "Não definido"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Orçamento:</span>
                            <p className="font-medium">R$ {adSet.budget}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Data Início:</span>
                            <p className="font-medium">{adSet.startDate || "Não definida"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Data Fim:</span>
                            <p className="font-medium">{adSet.endDate || "Não definida"}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Criativos */}
          {creatives && creatives.length > 0 && (
            <>
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Criativos
                </h3>
                <div className="space-y-4">
                  {creatives.map((creative, index) => (
                    <div key={index} className="border rounded-lg p-4" data-testid={`creative-${index}`}>
                      <h4 className="font-medium mb-2">Criativo {index + 1}</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Título:</span>
                          <p className="font-medium">{creative.title || "Não definido"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Texto:</span>
                          <p className="font-medium">{creative.text || "Não definido"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pasta Google Drive:</span>
                          <p className="font-medium">{creative.driveFolderId || "Não definida"}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Status Detail */}
          {campaign.statusDetail && (
            <div>
              <h3 className="font-semibold mb-2">Detalhes do Status</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-status-detail">{campaign.statusDetail}</p>
            </div>
          )}

          {/* Legacy Data */}
          {(campaign.budget || campaign.title || campaign.message) && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 text-muted-foreground">Informações Adicionais</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {campaign.budget && (
                    <div>
                      <span className="text-muted-foreground">Orçamento:</span>
                      <p className="font-medium">R$ {campaign.budget}</p>
                    </div>
                  )}
                  {campaign.title && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Título:</span>
                      <p className="font-medium">{campaign.title}</p>
                    </div>
                  )}
                  {campaign.message && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Mensagem:</span>
                      <p className="font-medium">{campaign.message}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {(showSendButton && campaign.status === "draft") || showReprocessButton ? (
          <DialogFooter>
            {showReprocessButton && (
              <Button
                variant="outline"
                onClick={() => sendMutation.mutate(campaign.id)}
                disabled={sendMutation.isPending || isCooldownActive}
                data-testid="button-reprocess-campaign"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? "Reprocessando..." : "Reprocessar"}
              </Button>
            )}
            {showSendButton && campaign.status === "draft" && (
              <Button
                onClick={() => sendMutation.mutate(campaign.id)}
                disabled={sendMutation.isPending || isCooldownActive}
                data-testid="button-send-automation"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? "Enviando..." : "Enviar Automação"}
              </Button>
            )}
            {isCooldownActive && (
              <p className="text-xs text-muted-foreground">
                Aguarde {formatCountdown(cooldownSeconds)} para reenviar para esta conta.
              </p>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
