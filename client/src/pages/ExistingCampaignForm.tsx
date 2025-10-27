import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function ExistingCampaignForm() {
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);

  const objectives = [
    { value: "LEAD", label: "Geração de Leads", requiresLeadForm: true },
    { value: "TRAFFIC", label: "Tráfego", requiresWebsite: true },
    { value: "WHATSAPP", label: "WhatsApp", requiresWhatsApp: true },
    { value: "CONVERSIONS", label: "Conversões" },
    { value: "REACH", label: "Alcance" },
  ];

  const toggleObjective = (value: string) => {
    setSelectedObjectives((prev) =>
      prev.includes(value) ? prev.filter((o) => o !== value) : [...prev, value]
    );
  };

  const needsLeadForm = selectedObjectives.includes("LEAD");
  const needsWebsite = selectedObjectives.includes("TRAFFIC");
  const needsWhatsApp = selectedObjectives.includes("WHATSAPP");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Adicionar a Campanha Existente</h1>
        <p className="text-muted-foreground">
          Adicione novos anúncios a campanhas já criadas no Meta Ads
        </p>
      </div>

      <form className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Objetivos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Selecione um ou mais objetivos para esta campanha
            </p>
            {objectives.map((objective) => (
              <div key={objective.value} className="flex items-center space-x-2">
                <Checkbox
                  id={objective.value}
                  checked={selectedObjectives.includes(objective.value)}
                  onCheckedChange={() => toggleObjective(objective.value)}
                  data-testid={`checkbox-objective-${objective.value.toLowerCase()}`}
                />
                <Label htmlFor={objective.value} className="cursor-pointer">
                  {objective.label}
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page">Página Facebook *</Label>
                <Select>
                  <SelectTrigger id="page" data-testid="select-page">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pg_987">Página Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram User ID *</Label>
                <Select>
                  <SelectTrigger id="instagram" data-testid="select-instagram">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ig_456">Instagram Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsWhatsApp && (
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Number ID *</Label>
                <Select>
                  <SelectTrigger id="whatsapp" data-testid="select-whatsapp">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wa_789">WhatsApp Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsLeadForm && (
              <div className="space-y-2">
                <Label htmlFor="leadform">Formulário de Leads *</Label>
                <Select>
                  <SelectTrigger id="leadform" data-testid="select-leadform">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lf_321">Formulário Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsWebsite && (
              <div className="space-y-2">
                <Label htmlFor="website">Website URL *</Label>
                <Select>
                  <SelectTrigger id="website" data-testid="select-website">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https://exemplo.com">Site Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Criativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" placeholder="Título do anúncio" data-testid="input-title" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Texto Principal *</Label>
              <Textarea
                id="message"
                placeholder="Mensagem do anúncio"
                rows={4}
                data-testid="input-message"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
              <Select>
                <SelectTrigger id="drive-folder" data-testid="select-drive-folder">
                  <SelectValue placeholder="Selecione a pasta com criativos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="folder_123">Pasta Principal de Criativos</SelectItem>
                  <SelectItem value="folder_456">Campanhas Sazonais</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button variant="outline" type="button" data-testid="button-cancel">
            Cancelar
          </Button>
          <Button type="submit" data-testid="button-submit">
            Enviar para n8n
          </Button>
        </div>
      </form>
    </div>
  );
}
