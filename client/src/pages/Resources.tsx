import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ResourceType = "account" | "page" | "instagram" | "whatsapp" | "leadform" | "website";

interface Resource {
  id: number;
  tenantId: number;
  type: ResourceType;
  name: string;
  value: string;
}

const resourceTypeLabels: Record<ResourceType, { title: string; placeholder: string }> = {
  account: { title: "Conta de Anúncios", placeholder: "act_123456789" },
  page: { title: "Página do Facebook", placeholder: "pg_987654321" },
  instagram: { title: "Instagram Business", placeholder: "ig_456789123" },
  whatsapp: { title: "WhatsApp Business", placeholder: "wa_789123456" },
  leadform: { title: "Formulário de Leads", placeholder: "lf_321654987" },
  website: { title: "Website", placeholder: "https://exemplo.com" },
};

export default function Resources() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<ResourceType>("account");
  const [newResource, setNewResource] = useState({
    type: "account" as ResourceType,
    name: "",
    value: "",
  });
  const { toast } = useToast();

  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: ResourceType; name: string; value: string }) =>
      apiRequest("POST", "/api/resources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setIsDialogOpen(false);
      setNewResource({ type: "account", name: "", value: "" });
      toast({
        title: "Recurso criado com sucesso",
        description: "O recurso foi adicionado à sua lista",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar recurso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Recurso excluído",
        description: "O recurso foi removido com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir recurso",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newResource);
  };

  const groupedResources = resources.reduce((acc, resource) => {
    if (!acc[resource.type]) {
      acc[resource.type] = [];
    }
    acc[resource.type].push(resource);
    return acc;
  }, {} as Record<ResourceType, Resource[]>);

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

      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as ResourceType)}>
        <TabsList>
          <TabsTrigger value="account" data-testid="tab-accounts">Contas</TabsTrigger>
          <TabsTrigger value="page" data-testid="tab-pages">Páginas</TabsTrigger>
          <TabsTrigger value="instagram" data-testid="tab-instagram">Instagram</TabsTrigger>
          <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="leadform" data-testid="tab-leadforms">Formulários</TabsTrigger>
          <TabsTrigger value="website" data-testid="tab-websites">Websites</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="mt-6 text-center py-12">
            <p className="text-muted-foreground">Carregando recursos...</p>
          </div>
        ) : (
          (Object.keys(resourceTypeLabels) as ResourceType[]).map((type) => (
            <TabsContent key={type} value={type} className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedResources[type]?.length > 0 ? (
                  groupedResources[type].map((resource) => (
                    <ResourceCard
                      key={resource.id}
                      title={resource.name}
                      label={resourceTypeLabels[type].title}
                      value={resource.value}
                      onEdit={() => {
                        toast({
                          title: "Em desenvolvimento",
                          description: "Funcionalidade de edição em breve",
                        });
                      }}
                      onDelete={() => deleteMutation.mutate(resource.id)}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-muted-foreground">
                      Nenhum recurso cadastrado nesta categoria
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          ))
        )}
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Recurso</DialogTitle>
            <DialogDescription>Preencha os dados do novo recurso</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de Recurso</Label>
                <Select
                  value={newResource.type}
                  onValueChange={(value) =>
                    setNewResource({ ...newResource, type: value as ResourceType })
                  }
                >
                  <SelectTrigger data-testid="select-resource-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="account">Conta de Anúncios</SelectItem>
                    <SelectItem value="page">Página do Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram Business</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp Business</SelectItem>
                    <SelectItem value="leadform">Formulário de Leads</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome Descritivo</Label>
                <Input
                  id="name"
                  placeholder="Nome para identificar este recurso"
                  value={newResource.name}
                  onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                  data-testid="input-resource-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">ID ou URL</Label>
                <Input
                  id="value"
                  placeholder={resourceTypeLabels[newResource.type].placeholder}
                  value={newResource.value}
                  onChange={(e) => setNewResource({ ...newResource, value: e.target.value })}
                  data-testid="input-resource-value"
                  required
                />
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
              <Button
                type="submit"
                data-testid="button-save"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
