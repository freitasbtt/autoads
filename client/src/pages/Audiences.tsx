import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Audience {
  id: number;
  tenantId: number;
  name: string;
  type: string;
  ageMin: number | null;
  ageMax: number | null;
  interests: string[];
  behaviors: string[];
  locations: string[];
}

export default function Audiences() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAudience, setNewAudience] = useState({
    name: "",
    ageMin: "",
    ageMax: "",
    interests: "",
    behaviors: "",
    locations: "",
  });
  const { toast } = useToast();

  const { data: audiences = [], isLoading } = useQuery<Audience[]>({
    queryKey: ["/api/audiences"],
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      ageMin: number | null;
      ageMax: number | null;
      interests: string[];
      behaviors: string[];
      locations: string[];
    }) => apiRequest("POST", "/api/audiences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiences"] });
      setIsDialogOpen(false);
      setNewAudience({ name: "", ageMin: "", ageMax: "", interests: "", behaviors: "", locations: "" });
      toast({
        title: "Público criado com sucesso",
        description: "O público foi adicionado à sua lista",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar público",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/audiences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiences"] });
      toast({
        title: "Público excluído",
        description: "O público foi removido com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir público",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const locations = newAudience.locations
      .split("\n")
      .map((loc) => loc.trim())
      .filter((loc) => loc.length > 0);

    const data = {
      name: newAudience.name,
      type: "interesse", // default type
      ageMin: newAudience.ageMin ? parseInt(newAudience.ageMin) : null,
      ageMax: newAudience.ageMax ? parseInt(newAudience.ageMax) : null,
      interests: newAudience.interests
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length > 0),
      behaviors: newAudience.behaviors
        .split(",")
        .map((b) => b.trim())
        .filter((b) => b.length > 0),
      locations: locations,
    };

    createMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Públicos-Alvo</h1>
          <p className="text-muted-foreground">Gerencie seus perfis de audiência para campanhas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-audience">
            <Plus className="h-4 w-4 mr-2" />
            Novo Público
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando públicos...</p>
        </div>
      ) : audiences.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum público cadastrado</p>
          <p className="text-sm text-muted-foreground mt-2">
            Clique em "Novo Público" para criar seu primeiro público-alvo
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {audiences.map((audience) => (
            <Card key={audience.id} data-testid={`card-audience-${audience.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base mb-2">{audience.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {audience.ageMin && audience.ageMax && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Idade:</span>
                    <span className="ml-2 font-medium">
                      {audience.ageMin} - {audience.ageMax} anos
                    </span>
                  </div>
                )}
                {audience.interests && audience.interests.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Interesses:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {audience.interests.map((interest, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {audience.behaviors && audience.behaviors.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Comportamentos:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {audience.behaviors.map((behavior, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {behavior}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {audience.locations && audience.locations.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Localizações:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {audience.locations.map((location, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {location}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => deleteMutation.mutate(audience.id)}
                    data-testid={`button-delete-audience-${audience.id}`}
                  >
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Público</DialogTitle>
            <DialogDescription>
              Defina os critérios de segmentação para sua audiência
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="audience-name">Nome do Público *</Label>
                <Input
                  id="audience-name"
                  placeholder="Ex: Público Leads 25-45"
                  value={newAudience.name}
                  onChange={(e) => setNewAudience({ ...newAudience, name: e.target.value })}
                  data-testid="input-audience-name"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age-min">Idade Mínima</Label>
                  <Input
                    id="age-min"
                    type="number"
                    placeholder="18"
                    value={newAudience.ageMin}
                    onChange={(e) => setNewAudience({ ...newAudience, ageMin: e.target.value })}
                    data-testid="input-age-min"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age-max">Idade Máxima</Label>
                  <Input
                    id="age-max"
                    type="number"
                    placeholder="65"
                    value={newAudience.ageMax}
                    onChange={(e) => setNewAudience({ ...newAudience, ageMax: e.target.value })}
                    data-testid="input-age-max"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interests">Interesses (separados por vírgula)</Label>
                <Textarea
                  id="interests"
                  placeholder="Marketing Digital, Empreendedorismo, Vendas"
                  rows={3}
                  value={newAudience.interests}
                  onChange={(e) => setNewAudience({ ...newAudience, interests: e.target.value })}
                  data-testid="input-interests"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="behaviors">Comportamentos (separados por vírgula)</Label>
                <Textarea
                  id="behaviors"
                  placeholder="Compradores online, Viajantes frequentes"
                  rows={3}
                  value={newAudience.behaviors}
                  onChange={(e) => setNewAudience({ ...newAudience, behaviors: e.target.value })}
                  data-testid="input-behaviors"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locations">Localizações (separadas por vírgula) *</Label>
                <Textarea
                  id="locations"
                  placeholder="São Paulo, SP, Brasil&#10;Rio de Janeiro, RJ, Brasil&#10;Brasil"
                  rows={3}
                  value={newAudience.locations}
                  onChange={(e) => setNewAudience({ ...newAudience, locations: e.target.value })}
                  data-testid="input-locations"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Digite cidades, estados ou países separados por vírgula. Exemplos: "Brasil" ou "São Paulo, SP, Brasil"
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="button-save-audience" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Público"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
