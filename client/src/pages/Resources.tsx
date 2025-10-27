import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ResourceCard from "@/components/ResourceCard";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Resources() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("accounts");

  const resources = {
    accounts: [
      { id: 1, title: "Conta Principal", label: "Account ID", value: "act_123456789" },
    ],
    pages: [
      { id: 1, title: "Página Facebook", label: "Page ID", value: "pg_987654321" },
    ],
    instagram: [
      { id: 1, title: "Instagram Business", label: "Instagram User ID", value: "ig_456789123" },
    ],
    whatsapp: [
      { id: 1, title: "WhatsApp Business", label: "Phone Number ID", value: "wa_789123456" },
    ],
    leadforms: [
      { id: 1, title: "Formulário de Leads Principal", label: "Form ID", value: "lf_321654987" },
    ],
    websites: [
      { id: 1, title: "Site Principal", label: "Website URL", value: "https://exemplo.com" },
    ],
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Recursos</h1>
          <p className="text-muted-foreground">Gerencie seus recursos Meta Ads</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-resource">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Recurso
        </Button>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab}>
        <TabsList>
          <TabsTrigger value="accounts" data-testid="tab-accounts">Contas</TabsTrigger>
          <TabsTrigger value="pages" data-testid="tab-pages">Páginas</TabsTrigger>
          <TabsTrigger value="instagram" data-testid="tab-instagram">Instagram</TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="leadforms" data-testid="tab-leadforms">Formulários</TabsTrigger>
          <TabsTrigger value="websites" data-testid="tab-websites">Websites</TabsTrigger>
        </TabsList>

        {Object.entries(resources).map(([key, items]) => (
          <TabsContent key={key} value={key} className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  title={resource.title}
                  label={resource.label}
                  value={resource.value}
                  onEdit={() => console.log("Edit", resource.id)}
                  onDelete={() => console.log("Delete", resource.id)}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Recurso</DialogTitle>
            <DialogDescription>Preencha os dados do novo recurso</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" placeholder="Nome descritivo" data-testid="input-resource-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor (ID ou URL)</Label>
              <Input id="value" placeholder="act_123456789" data-testid="input-resource-value" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button onClick={() => { console.log("Save resource"); setIsDialogOpen(false); }} data-testid="button-save">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
