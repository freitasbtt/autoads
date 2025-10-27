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

export default function CampaignForm() {
  const [objective, setObjective] = useState("");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Nova Campanha</h1>
        <p className="text-muted-foreground">Crie uma nova campanha Meta Ads com 3 Ad Sets</p>
      </div>

      <form className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Campanha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Nome da Campanha *</Label>
              <Input id="campaign-name" placeholder="Ex: Promoção de Verão 2025" data-testid="input-campaign-name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="objective">Objetivo *</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger id="objective" data-testid="select-objective">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEAD">Geração de Leads</SelectItem>
                    <SelectItem value="TRAFFIC">Tráfego</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="CONVERSIONS">Conversões</SelectItem>
                    <SelectItem value="REACH">Alcance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Orçamento Diário *</Label>
                <Input id="budget" type="number" placeholder="0.00" data-testid="input-budget" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account">Conta Meta Ads *</Label>
                <Select>
                  <SelectTrigger id="account" data-testid="select-account">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="act_123">Conta Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            {objective === "LEAD" && (
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

            {objective === "TRAFFIC" && (
              <div className="space-y-2">
                <Label htmlFor="website">Website URL *</Label>
                <Input id="website" placeholder="https://exemplo.com" data-testid="input-website" />
              </div>
            )}

            {objective === "WHATSAPP" && (
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
              <Textarea id="message" placeholder="Mensagem do anúncio" rows={4} data-testid="input-message" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-folder">Pasta Google Drive *</Label>
              <Input id="drive-folder" placeholder="ID da pasta" data-testid="input-drive-folder" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agendamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Data/Hora de Início *</Label>
                <Input id="start-time" type="datetime-local" data-testid="input-start-time" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-time">Data/Hora de Fim</Label>
                <Input id="end-time" type="datetime-local" data-testid="input-end-time" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button variant="outline" type="button" data-testid="button-cancel">
            Cancelar
          </Button>
          <Button type="submit" data-testid="button-submit">
            Criar Campanha
          </Button>
        </div>
      </form>
    </div>
  );
}
