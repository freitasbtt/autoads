import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { DashboardSyncAccount } from "../types";

type DashboardSyncPanelProps = {
  accounts: DashboardSyncAccount[];
  isLoading: boolean;
  pendingKey: string | null;
  onEnable: (adAccountId: string) => Promise<unknown>;
  onDisable: (adAccountId: string) => Promise<unknown>;
};

function getIndicatorState(account: DashboardSyncAccount, isBusy: boolean) {
  if (isBusy || account.syncStatus === "syncing") {
    return {
      label: "Carregando dados",
      loading: true,
      className: "text-slate-500",
    };
  }
  if (account.syncStatus === "error") {
    return {
      label: "Falha na sincronizacao",
      loading: false,
      className: "bg-red-500",
    };
  }
  if (account.syncEnabled && account.syncStatus === "active") {
    return {
      label: "Sincronizacao ativa",
      loading: false,
      className: "bg-emerald-500",
    };
  }
  return {
    label: "Sincronizacao desligada",
    loading: false,
    className: "bg-slate-300",
  };
}

export function DashboardSyncPanel({
  accounts,
  isLoading,
  pendingKey,
  onEnable,
  onDisable,
}: DashboardSyncPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando contas adicionadas
      </div>
    );
  }

  if (accounts.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">Contas adicionadas</h2>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {accounts.map((account) => {
          const isBusy = pendingKey?.startsWith(`${account.adAccountId}:`) ?? false;
          const isChecked = account.syncEnabled;
          const indicator = getIndicatorState(account, isBusy);

          return (
            <div
              key={account.adAccountId}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-950">
                    {account.accountName}
                  </p>
                  {indicator.loading ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-slate-500"
                      aria-label={indicator.label}
                    />
                  ) : (
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", indicator.className)}
                      aria-label={indicator.label}
                      role="img"
                    />
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {account.adAccountId}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch
                  checked={isChecked}
                  disabled={isBusy}
                  aria-label={`Alternar sincronizacao de ${account.accountName}`}
                  onCheckedChange={(checked) => {
                    void (
                      checked
                        ? onEnable(account.adAccountId)
                        : onDisable(account.adAccountId)
                    );
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
