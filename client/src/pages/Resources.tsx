"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Link as LinkIcon,
  Search as SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const resourceTypeLabels: Record<
  ResourceType,
  { title: string; placeholder: string; description?: string }
> = {
  account: {
    title: "Conta de Anúncios",
    placeholder: "act_123456789",
    description:
      "Conta de anúncios usada para veicular campanhas no Gestor de Anúncios.",
  },
  page: {
    title: "Página do Facebook",
    placeholder: "123456789012345",
    description:
      "Página que serve de origem para os teus anúncios no Facebook.",
  },
  instagram: {
    title: "Instagram Business",
    placeholder: "17841400000000000",
    description:
      "Perfil profissional de Instagram ligado a uma Página do Facebook.",
  },
  whatsapp: {
    title: "WhatsApp Business",
    placeholder: "wa_789123456",
    description:
      "Número de WhatsApp Business usado em campanhas e conversões.",
  },
  leadform: {
    title: "Formulário de Leads",
    placeholder: "lf_321654987",
    description:
      "Formulário de geração de leads associado a anúncios.",
  },
  website: {
    title: "Website",
    placeholder: "https://exemplo.com",
    description:
      "Domínio ou URL de destino utilizado nas tuas campanhas.",
  },
  drive_folder: {
    title: "Pasta do Google Drive",
    placeholder: "1AbCDefg123456",
    description:
      "Pasta com criativos, documentos e materiais de apoio.",
  },
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

  // Lista de recursos do tenant
  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  // Criar recurso manualmente (via modal)
  const createMutation = useMutation({
    mutationFn: (data: { type: ResourceType; name: string; value: string }) =>
      apiRequest("POST", "/api/resources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setIsDialogOpen(false);
      setNewResource({
        type: resolveTypeFromFilter(typeFilter),
        name: "",
        value: "",
      });
      toast({
        title: "Recurso criado com sucesso",
        description: "O recurso foi adicionado à tua lista.",
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

  // Apagar recurso
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Recurso excluído",
        description: "O recurso foi removido com sucesso.",
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

  // Apagar todos os recursos de um tipo
  const bulkDeleteMutation = useMutation({
    mutationFn: async (type: ResourceType) => {
      const res = await apiRequest("DELETE", `/api/resources/type/${type}`);
      return (await res.json()) as { deleted: number };
    },
    onSuccess: (data, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Recursos removidos",
        description: `${data.deleted} recurso(s) do tipo ${resourceTypeLabels[type].title} foram removidos.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover recursos",
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

  // Depois do OAuth (redirect com ?oauth=success), apenas actualiza lista
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      toast({
        title: "Conectado com sucesso à Meta",
        description:
          "As contas, páginas e perfis ligados foram importados automaticamente.",
      });

      // Limpa a query na URL
      window.history.replaceState({}, "", "/resources");

      // Faz refetch dos recursos (o backend já guardou tudo no callback)
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    }
  }, [toast]);

  // Leitura inicial de parâmetros (?type=...&new=1) para abrir modal / aplicar filtro
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
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${nextUrl}`,
      );
    }
  }, []);

  // --- Filtros & ordenação em memória ---

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredResources = useMemo(
    () =>
      resources.filter((resource) => {
        const matchesType =
          typeFilter === "all" || resource.type === typeFilter;
        if (!matchesType) return false;

        if (!normalizedSearch) return true;

        return (
          resource.name.toLowerCase().includes(normalizedSearch) ||
          resource.value.toLowerCase().includes(normalizedSearch)
        );
      }),
    [resources, typeFilter, normalizedSearch],
  );

  const sortedResources = useMemo(() => {
    const copy = [...filteredResources];
    if (sortOption === "name") {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredResources, sortOption]);

  const hasResults = sortedResources.length > 0;
  const totalFiltered = sortedResources.length;

  const countsByType: Record<ResourceType, number> = useMemo(
    () =>
      orderedResourceTypes.reduce(
        (acc, type) => {
          acc[type] = resources.filter(
            (r) => r.type === type,
          ).length;
          return acc;
        },
        {} as Record<ResourceType, number>,
      ),
    [resources],
  );

  const handleOpenDialog = (forcedType?: ResourceType) => {
    setNewResource({
      type: forcedType ?? resolveTypeFromFilter(typeFilter),
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

  const handleBulkDeleteByType = (type: ResourceType) => {
    const count = countsByType[type];
    if (!count) {
      toast({
        title: "Nada para remover",
        description: "N�o existem recursos desse tipo para apagar.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Desejas remover ${count} recurso(s) do tipo "${resourceTypeLabels[type].title}"? Esta ac��o n�o pode ser desfeita.`,
    );
    if (!confirmed) return;

    bulkDeleteMutation.mutate(type);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 1. Cabeçalho + integrações principais */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold">Recursos</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Centraliza aqui todas as contas, páginas, formulários,
              websites e pastas que o sistema vai usar nas campanhas.
            </p>
            <p className="text-xs text-muted-foreground">
              {totalFiltered} recurso(s) visível(eis) com os filtros
              actuais.
            </p>
          </div>

          <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleMetaOAuth}
              data-testid="button-connect-meta"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Conectar com Meta
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              data-testid="button-add-resource"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar recurso manual
            </Button>
          </div>
        </div>

        {/* Secção de resumo de integrações / tipos */}
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {/* Cartão principal da Meta */}
          <div className="flex flex-col justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Meta (Facebook / IG)</p>
              <p className="text-xs text-muted-foreground">
                Contas de anúncios, páginas e Instagram Business ligadas
                a este tenant.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                {countsByType.account} conta(s)
              </Badge>
              <Badge variant="secondary">
                {countsByType.page} página(s)
              </Badge>
              <Badge variant="secondary">
                {countsByType.instagram} Instagram(s)
              </Badge>
              {countsByType.leadform > 0 && (
                <Badge variant="secondary">
                  {countsByType.leadform} formulário(s)
                </Badge>
              )}
            </div>
          </div>

          {/* Cartão Google Drive */}
          <div className="flex flex-col justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Google Drive</p>
              <p className="text-xs text-muted-foreground">
                Pastas disponíveis para guardar criativos e documentos.
              </p>
            </div>
            <div className="mt-3">
              <Badge variant="secondary">
                {countsByType.drive_folder} pasta(s)
              </Badge>
            </div>
          </div>

          {/* Cartão Websites */}
          <div className="flex flex-col justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Websites</p>
              <p className="text-xs text-muted-foreground">
                Domínios e URLs de destino usados nas campanhas.
              </p>
            </div>
            <div className="mt-3">
              <Badge variant="secondary">
                {countsByType.website} website(s)
              </Badge>
            </div>
          </div>

          {/* Cartão WhatsApp (se houver) */}
          <div className="flex flex-col justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">WhatsApp Business</p>
              <p className="text-xs text-muted-foreground">
                Números ligados às campanhas de mensagens.
              </p>
            </div>
            <div className="mt-3">
              <Badge variant="secondary">
                {countsByType.whatsapp} número(s)
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filtros para pesquisar recursos */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:flex-1">
            <div className="relative w-full">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou ID/URL"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-resource-search"
              />
            </div>

            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as ResourceFilter)
              }
            >
              <SelectTrigger
                className="w-full md:w-[220px]"
                data-testid="select-resource-filter"
              >
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
            onValueChange={(value) =>
              setSortOption(value as SortOption)
            }
          >
            <SelectTrigger
              className="w-full md:w-[200px]"
              data-testid="select-resource-sort"
            >
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Botões de atalho de tipo (opcional, mas útil) */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "outline"}
            onClick={() => setTypeFilter("all")}
          >
            Todos
            <span className="ml-2 text-xs opacity-80">
              {resources.length}
            </span>
          </Button>

          {orderedResourceTypes.map((type) => {
            const count = countsByType[type];
            if (!count) return null;
            return (
              <Button
                key={type}
                size="sm"
                variant={
                  typeFilter === type ? "default" : "outline"
                }
                onClick={() => setTypeFilter(type)}
              >
                {resourceTypeLabels[type].title}
                <span className="ml-2 text-xs opacity-80">
                  {count}
                </span>
              </Button>
            );
          })}

          {typeFilter !== "all" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetFilters}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* 3. Lista de recursos (vista única, sem secções exageradas) */}
      {isLoading ? (
        <div className="mt-6 text-center py-12">
          <p className="text-muted-foreground">
            Carregando recursos...
          </p>
        </div>
      ) : hasResults ? (
        <div className="space-y-4">
          {/* “Resumo” contextual do tipo filtrado */}
          {typeFilter !== "all" && (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {resourceTypeLabels[typeFilter].title}
                </p>
                {resourceTypeLabels[typeFilter].description && (
                  <p className="text-xs text-muted-foreground">
                    {resourceTypeLabels[typeFilter].description}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    handleBulkDeleteByType(typeFilter as ResourceType)
                  }
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-delete-resources-by-type"
                >
                  {bulkDeleteMutation.isPending ? "Removendo..." : "Remover todos"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleOpenDialog(
                      typeFilter === "all"
                        ? undefined
                        : (typeFilter as ResourceType),
                    )
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Adicionar {typeFilter !== "all"
                    ? resourceTypeLabels[typeFilter].title
                    : "recurso"}
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedResources.map((resource) => {
              const info = resourceTypeLabels[resource.type];
              return (
                <ResourceCard
                  key={resource.id}
                  title={resource.name}
                  label={info.title}
                  value={resource.value}
                  onEdit={() => {
                    toast({
                      title: "Em desenvolvimento",
                      description:
                        "A edição de recursos será adicionada em breve.",
                    });
                  }}
                  onDelete={() =>
                    deleteMutation.mutate(resource.id)
                  }
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-base font-semibold">
            Nenhum recurso encontrado
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajusta os filtros ou cria um novo recurso para usá-lo em
            campanhas.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={handleResetFilters}
              data-testid="button-reset-filters"
            >
              Limpar filtros
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              data-testid="button-empty-add-resource"
            >
              Adicionar recurso
            </Button>
          </div>
        </div>
      )}

      {/* Modal para criar recurso manualmente */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar recurso</DialogTitle>
            <DialogDescription>
              Escolhe o tipo de recurso e preenche os dados mínimos para
              o identificarmos nas tuas campanhas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de recurso</Label>
                <Select
                  value={newResource.type}
                  onValueChange={(value) =>
                    setNewResource({
                      ...newResource,
                      type: value as ResourceType,
                    })
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
                {resourceTypeLabels[newResource.type].description && (
                  <p className="text-xs text-muted-foreground">
                    {resourceTypeLabels[newResource.type].description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome descritivo</Label>
                <Input
                  id="name"
                  placeholder="Nome para identificar este recurso"
                  value={newResource.name}
                  onChange={(e) =>
                    setNewResource({
                      ...newResource,
                      name: e.target.value,
                    })
                  }
                  data-testid="input-resource-name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="value">ID ou URL</Label>
                <Input
                  id="value"
                  placeholder={
                    resourceTypeLabels[newResource.type].placeholder
                  }
                  value={newResource.value}
                  onChange={(e) =>
                    setNewResource({
                      ...newResource,
                      value: e.target.value,
                    })
                  }
                  data-testid="input-resource-value"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Usa o ID exacto ou URL que a plataforma te fornece
                  (por exemplo, o ID da conta de anúncios ou o link do
                  website).
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
