import { Bug } from "lucide-react";

import { Button } from "@/components/ui/button";

type DashboardHeaderProps = {
  isSharedMode: boolean;
  isSystemAdmin: boolean;
  showDebug: boolean;
  onToggleDebug: () => void;
};

export function DashboardHeader({
  isSharedMode,
  isSystemAdmin,
  showDebug,
  onToggleDebug,
}: DashboardHeaderProps) {
  return (
    <section className="flex flex-col gap-3 px-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Dashboard
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
          {isSharedMode ? "Dashboard compartilhado" : "Dashboard"}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isSharedMode && isSystemAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleDebug}
            className="rounded-full border-slate-200 bg-white/85 shadow-sm"
          >
            <Bug className="h-4 w-4" />
            {showDebug ? "Ocultar debug" : "Mostrar debug"}
          </Button>
        )}
      </div>
    </section>
  );
}
