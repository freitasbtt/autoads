import KPICard from "../KPICard";
import { DollarSign } from "lucide-react";

export default function KPICardExample() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="Total Spend" value="R$ 12.450" icon={DollarSign} trend={{ value: "12.5%", positive: true }} />
    </div>
  );
}
