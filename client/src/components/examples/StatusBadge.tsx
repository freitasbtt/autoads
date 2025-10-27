import StatusBadge from "../StatusBadge";

export default function StatusBadgeExample() {
  return (
    <div className="flex gap-4">
      <StatusBadge status="connected" />
      <StatusBadge status="pending" />
      <StatusBadge status="error" />
    </div>
  );
}
