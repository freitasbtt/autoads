import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Status = "connected" | "pending" | "error";

interface StatusBadgeProps {
  status: Status;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = {
    connected: {
      icon: CheckCircle2,
      text: label || "Conectado",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    pending: {
      icon: AlertCircle,
      text: label || "Pendente",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    error: {
      icon: XCircle,
      text: label || "Erro",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  const { icon: Icon, text, className } = config[status];

  return (
    <Badge variant="outline" className={className} data-testid={`badge-status-${status}`}>
      <Icon className="w-3 h-3 mr-1" />
      {text}
    </Badge>
  );
}
