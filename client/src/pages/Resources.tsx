import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Link as LinkIcon, Search as SearchIcon } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ResourceType =
  | "account"
  | "page"
  | "instagram"
  | "whatsapp"
  | "leadform"
  | "website"
  | "drive_folder";
type ResourceFilter = ResourceType | "all";
type SortOption = "recent" | "name";

const resolveTypeFromFilter = (filter: ResourceFilter): ResourceType =>
  filter === "all" ? "account" : filter;

interface Resource {
  id: number;
  tenantId: number;
  type: ResourceType;
  name: string;
  value: string;
  createdAt?: string;
}

const resourceTypeLabels: Record<ResourceType, { title: string; placeholder: string }> = {
  account: { title: "Conta de Anúncios", placeholder: "act_123456789" },
  page: { title: "Página do Facebook", placeholder: "pg_987654321" },
  instagram: { title: "Instagram Business", placeholder: "ig_456789123" },
  whatsapp: { title: "WhatsApp Business", placeholder: "wa_789123456" },
  leadform: { title: "Formulário de Leads", placeholder: "lf_321654987" },
  website: { title: "Website", placeholder: "https://exemplo.com" },
  drive_folder: { title: "Pasta do Google Drive", placeholder: "1AbCDefg123456" },
};

const orderedResourceTypes: ResourceType[] = [
  "account",
  "page",
  "instagram",
  "whatsapp",
  "leadform",
  "website",
  "drive_folder",
];


export default function Resources() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ResourceFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [searchTerm, setSearchTerm] = useState("");
  const [newResource, setNewResource] = useState({
    type: resolveTypeFromFilter("all"),
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
      setNewResource({ type: resolveTypeFromFilter(typeFilter), name: "", value: "" });
      toast({
        title: "Recurso criado com sucesso",
        description: "O recurso foi adicionado Ã  sua lista",
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
        title: "Recurso excluÃ­do",
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

  const handleMetaOAuth = () => {
    window.location.href = "/auth/meta";
  };

  // Check for OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      toast({
        title: "Conectado com sucesso!",
        description: "Seus recursos Meta foram importados automaticamente.",
      });
      // Clean URL
      window.history.replaceState({}, '', '/resources');
      // Refresh resources
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    }
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get("type");
    const newParam = params.get("new");
    const matchedType = orderedResourceTypes.find(
      (type) => type === typeParam,
    );

    if (matchedType) {
      setTypeFilter(matchedType);
    }
    if (newParam === "1") {
      setNewResource({
        type: matchedType ?? resolveTypeFromFilter("all"),
        name: "",
        value: "",
      });
      setIsDialogOpen(true);
    }

    if (typeParam || newParam) {
      params.delete("type");
      params.delete("new");
      const next = params.toString();
      const nextUrl = next ? `?${next}` : "";
      window.history.replaceState({}, "", `${window.location.pathname}${nextUrl}`);
    }
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredResources = resources.filter((resource) => {
    const matchesType = typeFilter === "all" || resource.type === typeFilter;
    if (!matchesType) return false;

    if (!normalizedSearch) return true;
    return (
      resource.name.toLowerCase().includes(normalizedSearch) ||
      resource.value.toLowerCase().includes(normalizedSearch)
    );
  });

  const sortedResources = [...filteredResources].sort((a, b) => {
    if (sortOption === "name") {
      return a.name.localeCompare(b.name);
    }

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  const groupedResources = sortedResources.reduce((acc, resource) => {
    if (!acc[resource.type]) {
      acc[resource.type] = [];
    }
    acc[resource.type].push(resource);
    return acc;
  }, {} as Record<ResourceType, Resource[]>);

  const sectionTypes =
    typeFilter === "all"
      ? orderedResourceTypes.filter(
          (type) => (groupedResources[type]?.length ?? 0) > 0,
        )
      : [typeFilter];
  const hasResults = sortedResources.length > 0;

  const handleOpenDialog = () => {
    setNewResource({
      type: resolveTypeFromFilter(typeFilter),
      name: "",
      value: "",
    });
    setIsDialogOpen(true);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setSortOption("recent");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Recursos</h1>
            <p className="text-muted-foreground">Gerencie e conecte os ativos usados nas campanhas</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleMetaOAuth}
              data-testid="button-connect-meta"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Conectar com Meta
            </Button>
            <Button onClick={handleOpenDialog} data-testid="button-add-resource">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Recurso
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:flex-1">
            <div className="relative w-full">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou ID"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-resource-search"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as ResourceFilter)}
            >
              <SelectTrigger className="w-full md:w-[220px]" data-testid="select-resource-filter">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {orderedResourceTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {resourceTypeLabels[type].title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select
            value={sortOption}
            onValueChange={(value) => setSortOption(value as SortOption)}
          >
            <SelectTrigger className="w-full md:w-[200px]" data-testid="select-resource-sort">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 text-center py-12">
          <p className="text-muted-foreground">Carregando recursos...</p>
        </div>
      ) : hasResults ? (
        <div className="space-y-8">
          {sectionTypes.map((type) => {
            const typeResources = groupedResources[type] ?? [];
            if (typeResources.length === 0) {
              return null;
            }
            return (
              <section key={type} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-semibold">{resourceTypeLabels[type].title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {typeResources.length} recurso(s) disponível(is) para esta categoria
                    </p>
                  </div>
                  <Badge variant="secondary">{typeResources.length}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {typeResources.map((resource) => (
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
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-base font-semibold">Nenhum recurso encontrado</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajuste os filtros ou cadastre um novo recurso para usá-lo em campanhas.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={handleResetFilters} data-testid="button-reset-filters">
              Limpar filtros
            </Button>
            <Button onClick={handleOpenDialog} data-testid="button-empty-add-resource">
              Adicionar recurso
            </Button>
          </div>
        </div>
      )}

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
                    {orderedResourceTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {resourceTypeLabels[type].title}
                      </SelectItem>
                    ))}
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






