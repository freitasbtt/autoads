import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
}

export default function KPICard({ title, value, icon: Icon, trend }: KPICardProps) {
  return (
    <Card data-testid={`card-kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {trend && (
          <p className={`text-xs ${trend.positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {trend.positive ? "+" : ""}{trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
