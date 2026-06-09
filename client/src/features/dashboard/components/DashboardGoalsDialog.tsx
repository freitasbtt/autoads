import { useEffect, useMemo, useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

import type { DashboardGoalsResponse } from "../types";
import { formatCurrency, formatInteger } from "../utils";

type GoalRowState = {
  accountId: number;
  accountName: string;
  accountValue: string;
  goalId: number | null;
  initialTargetSpend: string;
  initialTargetLeads: string;
  targetSpend: string;
  targetLeads: string;
};

type DashboardGoalsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodLabel: string;
  goalsData?: DashboardGoalsResponse;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (
    goals: Array<{
      accountId: number;
      accountName: string;
      targetSpend: number;
      targetLeads: number;
    }>,
  ) => Promise<unknown>;
};

function normalizeMoneyInput(value: string) {
  return value.replace(",", ".");
}

function toNumber(value: string): number | null {
  const normalized = normalizeMoneyInput(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRows(data?: DashboardGoalsResponse): GoalRowState[] {
  return (data?.accounts ?? []).map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    accountValue: account.accountValue,
    goalId: account.goal?.id ?? null,
    initialTargetSpend:
      account.goal && Number.isFinite(account.goal.targetSpend)
        ? String(account.goal.targetSpend)
        : "",
    initialTargetLeads:
      account.goal && Number.isFinite(account.goal.targetLeads)
        ? String(account.goal.targetLeads)
        : "",
    targetSpend:
      account.goal && Number.isFinite(account.goal.targetSpend)
        ? String(account.goal.targetSpend)
        : "",
    targetLeads:
      account.goal && Number.isFinite(account.goal.targetLeads)
        ? String(account.goal.targetLeads)
        : "",
  }));
}

export function DashboardGoalsDialog({
  open,
  onOpenChange,
  periodLabel,
  goalsData,
  isLoading,
  isSaving,
  onSave,
}: DashboardGoalsDialogProps) {
  const [rows, setRows] = useState<GoalRowState[]>([]);

  useEffect(() => {
    if (open) {
      setRows(buildRows(goalsData));
    }
  }, [goalsData, open]);

  const hasChanges = useMemo(
    () =>
      rows.some(
        (row) =>
          row.targetSpend !== row.initialTargetSpend ||
          row.targetLeads !== row.initialTargetLeads,
      ),
    [rows],
  );

  const updateRow = (
    accountId: number,
    field: "targetSpend" | "targetLeads",
    value: string,
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.accountId === accountId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  };

  const handleSave = async () => {
    const partialRows = rows.filter((row) => {
      const spend = row.targetSpend.trim();
      const leads = row.targetLeads.trim();
      return (spend && !leads) || (!spend && leads);
    });

    if (partialRows.length > 0) {
      toast({
        variant: "destructive",
        title: "Preenchimento incompleto",
        description: "Informe investimento e leads para a mesma conta antes de salvar.",
      });
      return;
    }

    const invalidRows = rows.filter((row) => {
      const spend = toNumber(row.targetSpend);
      const leads = toNumber(row.targetLeads);
      if (spend === null && leads === null) return false;
      return spend === null || spend <= 0 || leads === null || leads <= 0;
    });

    if (invalidRows.length > 0) {
      toast({
        variant: "destructive",
        title: "Metas invalidas",
        description: "Use valores positivos para investimento e leads.",
      });
      return;
    }

    const payload = rows
      .map((row) => ({
        accountId: row.accountId,
        accountName: row.accountName,
        targetSpend: toNumber(row.targetSpend),
        targetLeads: toNumber(row.targetLeads),
      }))
      .filter(
        (row): row is {
          accountId: number;
          accountName: string;
          targetSpend: number;
          targetLeads: number;
        } => row.targetSpend !== null && row.targetLeads !== null,
      );

    if (payload.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma meta para salvar",
        description: "Preencha ao menos uma conta antes de salvar.",
      });
      return;
    }

    await onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-6xl overflow-hidden rounded-[28px] border-slate-200 bg-white p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="text-xl font-semibold text-slate-950">
            Metas do periodo
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Configure investimento e leads para as contas filtradas em{" "}
            <span className="font-medium text-slate-950">{periodLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Contas: {formatInteger(rows.length)}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Cadastradas: {formatInteger(goalsData?.summary.goalsCount ?? 0)}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Pendentes: {formatInteger(goalsData?.summary.missingCount ?? 0)}
            </Badge>
          </div>

          <div className="overflow-hidden rounded-[20px] border border-slate-200">
            <Table className="min-w-[980px]">
              <TableHeader className="bg-slate-50/90">
                <TableRow className="hover:bg-slate-50/90">
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Meta de Investimento</TableHead>
                  <TableHead className="text-right">Meta de Leads</TableHead>
                  <TableHead className="text-right">CPL Meta</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      Carregando metas...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      Nenhuma conta filtrada para configurar metas.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const spend = toNumber(row.targetSpend);
                    const leads = toNumber(row.targetLeads);
                    const cpl = spend !== null && leads !== null && leads > 0 ? spend / leads : null;
                    const isChanged =
                      row.targetSpend !== row.initialTargetSpend ||
                      row.targetLeads !== row.initialTargetLeads;
                    const status = isChanged
                      ? "Alterada"
                      : row.goalId
                        ? "Cadastrada"
                        : "Pendente";

                    return (
                      <TableRow key={row.accountId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-700">{row.accountName}</span>
                            <span className="text-xs text-slate-400">{row.accountValue}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={row.targetSpend}
                            onChange={(event) =>
                              updateRow(row.accountId, "targetSpend", event.target.value)
                            }
                            inputMode="decimal"
                            placeholder="0,00"
                            className="ml-auto w-[160px] text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={row.targetLeads}
                            onChange={(event) =>
                              updateRow(row.accountId, "targetLeads", event.target.value)
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="ml-auto w-[130px] text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          {cpl !== null ? formatCurrency(cpl) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              status === "Alterada"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : status === "Cadastrada"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Fechar
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || (!hasChanges && rows.length > 0)}>
            {isSaving ? "Salvando..." : "Salvar metas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
