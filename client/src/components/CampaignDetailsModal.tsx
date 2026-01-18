import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Campaign, Resource, Audience } from "@shared/schema";
import { Send } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { objectiveLabels } from "@/features/campaigns/constants";

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

  const getResourceName = (id: number | null) => {
    if (!id) return "-";
    const resource = resources.find((r) => r.id === id);
    return resource ? resource.name : "Nao encontrado";
  };
  const getResourceValue = (id: number | null) => {
    if (!id) return "-";
    const resource = resources.find((r) => r.id === id);
    return resource ? resource.value : "Nao encontrado";
  };

  if (!campaign) return null;
  const creatives = campaign?.creatives as any[] | null;
  const rawObjectives = Array.isArray((campaign as any).objectives)
    ? (campaign as any).objectives
    : [];
  const objectivesText =
    rawObjectives.length > 0
      ? rawObjectives
          .map((objective: unknown) => {
            const key = String(objective ?? "").toUpperCase();
            return objectiveLabels[key] ?? String(objective ?? "-");
          })
          .join(", ")
      : objectiveLabels[campaign.objective] ?? campaign.objective ?? "-";
  const primaryCreative = Array.isArray(creatives) ? creatives[0] : null;
  const copyTitle =
    typeof campaign.title === "string" && campaign.title.trim().length > 0
      ? campaign.title
      : typeof primaryCreative?.title === "string" && primaryCreative.title.trim().length > 0
        ? primaryCreative.title
        : "-";
  const copyText =
    typeof campaign.message === "string" && campaign.message.trim().length > 0
      ? campaign.message
      : typeof primaryCreative?.text === "string" && primaryCreative.text.trim().length > 0
        ? primaryCreative.text
        : "-";
  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
  const isCooldownActive = cooldownSeconds > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid="modal-campaign-details">
        <DialogHeader>
          <DialogTitle className="text-2xl" data-testid="text-campaign-name">
            #{campaign.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3">Configuracao da Campanha</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Conta Meta Ads:</span>
                <p className="font-medium" data-testid="text-account">{getResourceName(campaign.accountId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Objetivos (todos selecionados no formulario):
                </span>
                <p className="font-medium" data-testid="text-objective">{objectivesText}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Pagina:</span>
                <p className="font-medium" data-testid="text-page">{getResourceName(campaign.pageId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Instagram:</span>
                <p className="font-medium" data-testid="text-instagram">{getResourceName(campaign.instagramId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">WhatsApp:</span>
                <p className="font-medium" data-testid="text-whatsapp">{getResourceValue(campaign.whatsappId)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Formulario de Leads:</span>
                <p className="font-medium" data-testid="text-leadform">{getResourceName(campaign.leadformId)}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Copy anuncios</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Titulo:</span>
                <p className="font-medium">{copyTitle}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Texto:</span>
                <p className="font-medium whitespace-pre-wrap">{copyText}</p>
              </div>
            </div>
          </div>
        </div>

        {showSendButton && campaign.status === "draft" ? (
          <DialogFooter>
            <Button
              onClick={() => sendMutation.mutate(campaign.id)}
              disabled={sendMutation.isPending || isCooldownActive}
              data-testid="button-send-automation"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? "Enviando..." : "Enviar Automacao"}
            </Button>
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





