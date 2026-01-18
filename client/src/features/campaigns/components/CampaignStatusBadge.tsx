import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { statusLabels } from "../constants";
import type { Campaign } from "@shared/schema";
import { cn } from "@/lib/utils";

const statusIconMap: Record<string, ReactNode> = {
  active: <CheckCircle className="h-3 w-3 mr-1" />,
  pending: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
  error: <XCircle className="h-3 w-3 mr-1" />,
};

const statusStyleMap: Record<string, string> = {
  pending: "border-blue-200 bg-blue-100 text-blue-800",
  active: "border-emerald-200 bg-emerald-100 text-emerald-800",
  error: "border-red-200 bg-red-100 text-red-800",
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  paused: "border-zinc-200 bg-zinc-100 text-zinc-700",
  completed: "border-emerald-200 bg-emerald-100 text-emerald-800",
};

export interface CampaignStatusBadgeProps {
  status: Campaign["status"];
  statusDetail: Campaign["statusDetail"];
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("w-fit", statusStyleMap[status] ?? "border-muted")}
    >
      {statusIconMap[status] ?? null}
      {statusLabels[status] ?? status}
    </Badge>
  );
}
