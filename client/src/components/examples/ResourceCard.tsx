import ResourceCard from "../ResourceCard";

export default function ResourceCardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <ResourceCard
        title="Meta Ad Account"
        label="Account ID"
        value="act_123456789"
        onEdit={() => console.log("Edit clicked")}
        onDelete={() => console.log("Delete clicked")}
      />
    </div>
  );
}
