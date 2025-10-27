import { useState } from "react";
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

export default function Audiences() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  //todo: remove mock functionality
  const audiences = [
    {
      id: 1,
      name: "Público Principal - Leads 25-45",
      ageMin: 25,
      ageMax: 45,
      interests: ["Marketing Digital", "Empreendedorismo"],
      locations: ["São Paulo, Brasil", "Rio de Janeiro, Brasil"],
      size: "~500K",
      type: "Interesse",
    },
    {
      id: 2,
      name: "Clientes Existentes - Upload CSV",
      locations: ["Brasil"],
      size: "12.5K",
      type: "Custom List",
      uploadDate: "15/10/2024",
    },
    {
      id: 3,
      name: "Público Broad - 18-65",
      ageMin: 18,
      ageMax: 65,
      interests: ["Todos"],
      locations: ["Brasil", "Portugal"],
      size: "~2M",
      type: "Interesse",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Públicos-Alvo</h1>
          <p className="text-muted-foreground">Gerencie seus perfis de audiência para campanhas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsUploadOpen(true)} data-testid="button-upload-csv">
            <Upload className="h-4 w-4 mr-2" />
            Upload CSV
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-audience">
            <Plus className="h-4 w-4 mr-2" />
            Novo Público
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {audiences.map((audience) => (
          <Card key={audience.id} data-testid={`card-audience-${audience.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base mb-2">{audience.name}</CardTitle>
                  <Badge variant="outline">{audience.type}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {audience.ageMin && audience.ageMax && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Idade:</span>
                  <span className="ml-2 font-medium">{audience.ageMin} - {audience.ageMax} anos</span>
                </div>
              )}
              {audience.interests && (
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
              {audience.locations && (
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
              <div className="text-sm">
                <span className="text-muted-foreground">Tamanho estimado:</span>
                <span className="ml-2 font-medium">{audience.size}</span>
              </div>
              {audience.uploadDate && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Upload:</span>
                  <span className="ml-2">{audience.uploadDate}</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-edit-audience">
                  Editar
                </Button>
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-delete-audience">
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Público</DialogTitle>
            <DialogDescription>
              Defina os critérios de segmentação para sua audiência
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="audience-name">Nome do Público *</Label>
              <Input
                id="audience-name"
                placeholder="Ex: Público Leads 25-45"
                data-testid="input-audience-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age-min">Idade Mínima</Label>
                <Input
                  id="age-min"
                  type="number"
                  placeholder="18"
                  data-testid="input-age-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age-max">Idade Máxima</Label>
                <Input
                  id="age-max"
                  type="number"
                  placeholder="65"
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
                data-testid="input-interests"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="behaviors">Comportamentos (separados por vírgula)</Label>
              <Textarea
                id="behaviors"
                placeholder="Compradores online, Viajantes frequentes"
                rows={3}
                data-testid="input-behaviors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locations">Localizações (separadas por vírgula) *</Label>
              <Textarea
                id="locations"
                placeholder="São Paulo, Brasil, Rio de Janeiro, Brasil"
                rows={3}
                data-testid="input-locations"
              />
              <p className="text-xs text-muted-foreground">
                Digite cidades, estados ou países separados por vírgula
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                console.log("Save audience");
                setIsDialogOpen(false);
              }}
              data-testid="button-save-audience"
            >
              Criar Público
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload de Lista Customizada</DialogTitle>
            <DialogDescription>
              Faça upload de um arquivo CSV com emails ou telefones (os dados serão hasheados antes do envio)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="list-name">Nome da Lista *</Label>
              <Input
                id="list-name"
                placeholder="Ex: Clientes Existentes"
                data-testid="input-list-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="csv-file">Arquivo CSV *</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                data-testid="input-csv-file"
              />
              <p className="text-xs text-muted-foreground">
                O arquivo deve conter uma coluna "email" ou "phone"
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)} data-testid="button-cancel-upload">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                console.log("Upload CSV");
                setIsUploadOpen(false);
              }}
              data-testid="button-upload"
            >
              Fazer Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
