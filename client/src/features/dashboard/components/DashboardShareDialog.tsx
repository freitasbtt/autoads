import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, Share2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type DashboardShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodLabel: string;
  accountNames: string[];
  accountCount: number;
  campaignLabel: string | null;
  objectiveLabel: string | null;
  statusLabel: string | null;
  isCreating: boolean;
  isSyncingHistory: boolean;
  shareUrl: string | null;
  expiresAt: string | null;
  onGenerate: (options: { value: number; unit: "hours" | "days" }) => Promise<unknown>;
  onSyncHistory: () => Promise<unknown>;
};

export function DashboardShareDialog({
  open,
  onOpenChange,
  periodLabel,
  accountNames,
  accountCount,
  campaignLabel,
  objectiveLabel,
  statusLabel,
  isCreating,
  isSyncingHistory,
  shareUrl,
  expiresAt,
  onGenerate,
  onSyncHistory,
}: DashboardShareDialogProps) {
  const [expirationValue, setExpirationValue] = useState("3");
  const [expirationUnit, setExpirationUnit] = useState<"hours" | "days">("days");

  useEffect(() => {
    if (!open) {
      setExpirationValue("3");
      setExpirationUnit("days");
    }
  }, [open]);

  const visibleAccountNames = useMemo(() => accountNames.slice(0, 3), [accountNames]);

  const handleGenerate = async () => {
    const parsed = Number.parseInt(expirationValue, 10);
    const maxAllowed = expirationUnit === "days" ? 30 : 168;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > maxAllowed) {
      toast({
        variant: "destructive",
        title: "Expiração inválida",
        description:
          expirationUnit === "days"
            ? "Use um valor entre 1 e 30 dias."
            : "Use um valor entre 1 e 168 horas.",
      });
      return;
    }

    await onGenerate({
      value: parsed,
      unit: expirationUnit,
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copiado",
        description: "O link público do dashboard foi copiado.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Falha ao copiar",
        description: "Não foi possível copiar o link para a área de transferência.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[28px] border-slate-200 bg-white p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-slate-950">
            <Share2 className="h-5 w-5 text-slate-500" />
            Gerar link público
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            O link vai travar as contas escolhidas pelo admin e permitir no público apenas
            período, campanha, nome da campanha e objetivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Período
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{periodLabel}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Contas fixas
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {accountCount} selecionadas
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Resumo do link
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleAccountNames.map((name) => (
                <Badge key={name} variant="outline" className="rounded-full px-3 py-1">
                  {name}
                </Badge>
              ))}
              {accountCount > visibleAccountNames.length ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  +{accountCount - visibleAccountNames.length} contas
                </Badge>
              ) : null}
              {campaignLabel ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Campanha inicial: {campaignLabel}
                </Badge>
              ) : null}
              {objectiveLabel ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Objetivo inicial: {objectiveLabel}
                </Badge>
              ) : null}
              {statusLabel ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Status fixo: {statusLabel}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Expiração do link
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Input
                type="number"
                min={1}
                max={expirationUnit === "days" ? 30 : 168}
                value={expirationValue}
                onChange={(event) => setExpirationValue(event.target.value)}
              />
              <Select
                value={expirationUnit}
                onValueChange={(value) => setExpirationUnit(value as "hours" | "days")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-slate-500">
              {expirationUnit === "days"
                ? "O link pode vencer entre 1 e 30 dias."
                : "O link pode vencer entre 1 e 168 horas."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Histórico para o público
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Antes de gerar o link, atualize o histórico do período atual para garantir que o
              dashboard público consiga abrir esse recorte direto do banco.
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onSyncHistory()}
                disabled={isSyncingHistory || accountCount === 0}
              >
                {isSyncingHistory ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando histórico...
                  </>
                ) : (
                  "Atualizar histórico"
                )}
              </Button>
            </div>
          </div>

          {shareUrl ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Link gerado
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {expiresAt
                    ? `Expira em ${new Date(expiresAt).toLocaleString("pt-BR")}`
                    : "Expiração não informada"}
                </div>
              </div>

              <Input value={shareUrl} readOnly />

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  Copiar link
                </Button>
                <Button asChild type="button" variant="outline">
                  <a href={shareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Abrir link
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating || isSyncingHistory}
          >
            Fechar
          </Button>
          <Button
            onClick={() => void handleGenerate()}
            disabled={isCreating || isSyncingHistory || accountCount === 0}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Gerar link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
