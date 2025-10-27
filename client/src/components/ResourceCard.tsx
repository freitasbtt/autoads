import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";

interface ResourceCardProps {
  title: string;
  label: string;
  value: string;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ResourceCard({ title, label, value, onEdit, onDelete }: ResourceCardProps) {
  return (
    <Card data-testid={`card-resource-${title.toLowerCase()}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            data-testid="button-edit"
            className="h-8 w-8"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            data-testid="button-delete"
            className="h-8 w-8"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-1">{label}</div>
        <div className="font-mono text-sm">{value}</div>
      </CardContent>
    </Card>
  );
}
