import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { statusLabels } from "../constants";
import type { Campaign } from "@shared/schema";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const statusIconMap: Record<string, ReactNode> = {
  active: <CheckCircle className="h-3 w-3 mr-1" />,
  pending: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
  error: <XCircle className="h-3 w-3 mr-1" />,
};

export interface CampaignStatusBadgeProps {
  status: Campaign["status"];
  statusDetail: Campaign["statusDetail"];
}

export function CampaignStatusBadge({ status, statusDetail }: CampaignStatusBadgeProps) {
  let variant: BadgeVariant = "outline";

  switch (status) {
    case "active":
      variant = "default";
      break;
    case "pending":
      variant = "secondary";
      break;
    case "error":
      variant = "destructive";
      break;
    case "draft":
      variant = "secondary";
      break;
    case "paused":
    case "completed":
    default:
      variant = "outline";
      break;
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant} className="w-fit">
        {statusIconMap[status] ?? null}
        {statusLabels[status] ?? status}
      </Badge>
      {statusDetail && (
        <span className="text-xs text-muted-foreground">{statusDetail}</span>
      )}
    </div>
  );
}
