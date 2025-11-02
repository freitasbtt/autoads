import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronDown, Loader2, Plus, X } from "lucide-react";

const MIN_AGE = 18;
const MAX_AGE = 65;
const DEFAULT_CITY_RADIUS = 40;

type AudienceCity = {
  key: string;
  radius: number;
  distance_unit: "kilometer";
  name?: string;
  region?: string;
};

type AudienceInterest = {
  id: string;
  name: string;
};

type Audience = {
  id: number;
  tenantId: number;
  name: string;
  type: string;
  ageMin: number;
  ageMax: number;
  cities: AudienceCity[] | null;
  interests: AudienceInterest[] | null;
};

type CitySuggestion = {
  id: string;
  name: string;
  region?: string;
};

type InterestSuggestion = {
  id: string;
  name: string;
};

interface CreateAudiencePayload {
  name: string;
  type: string;
  ageMin: number;
  ageMax: number;
  cities: AudienceCity[];
  interests: AudienceInterest[];
  behaviors: string[];
  locations: string[];
}

interface AudienceFormState {
  name: string;
  ageMin: string;
  ageMax: string;
  cities: AudienceCity[];
  interests: AudienceInterest[];
}

const initialFormState: AudienceFormState = {
  name: "",
  ageMin: "",
  ageMax: "",
  cities: [],
  interests: [],
};

export default function Audiences() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAudience, setNewAudience] = useState<AudienceFormState>(initialFormState);
  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const [interestSearchOpen, setInterestSearchOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [interestQuery, setInterestQuery] = useState("");
  const { toast } = useToast();

  const { data: audiences = [], isLoading } = useQuery<Audience[]>({
    queryKey: ["/api/audiences"],
  });

  const resetForm = () => {
    setNewAudience(initialFormState);
    setCityQuery("");
    setInterestQuery("");
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateAudiencePayload) => apiRequest("POST", "/api/audiences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audiences"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Público criado com sucesso",
        description: "O público foi adicionado à sua lista.",
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
        description: "O público foi removido com sucesso.",
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

  const {
    data: cityResults = [],
    isFetching: isLoadingCities,
  } = useQuery<CitySuggestion[]>({
    queryKey: ["meta-city-search", cityQuery],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/meta/search/cities?q=${encodeURIComponent(cityQuery)}`
      );
      return (await res.json()) as CitySuggestion[];
    },
    enabled: citySearchOpen && cityQuery.length >= 2,
    staleTime: 0,
    retry: false,
    onError: (error: unknown) => {
      console.error("Failed to fetch Meta cities", error);
      toast({
        title: "Não foi possível buscar cidades",
        description: "Verifique a conexão com o Meta e tente novamente.",
        variant: "destructive",
      });
    },
  });

  const {
    data: interestResults = [],
    isFetching: isLoadingInterests,
  } = useQuery<InterestSuggestion[]>({
    queryKey: ["meta-interest-search", interestQuery],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/meta/search/interests?q=${encodeURIComponent(interestQuery)}`
      );
      return (await res.json()) as InterestSuggestion[];
    },
    enabled: interestSearchOpen && interestQuery.length >= 2,
    staleTime: 0,
    retry: false,
    onError: (error: unknown) => {
      console.error("Failed to fetch Meta interests", error);
      toast({
        title: "Não foi possível buscar interesses",
        description: "Verifique a conexão com o Meta e tente novamente.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!citySearchOpen) {
      setCityQuery("");
    }
  }, [citySearchOpen]);

  useEffect(() => {
    if (!interestSearchOpen) {
      setInterestQuery("");
    }
  }, [interestSearchOpen]);

  const cityEmptyMessage = useMemo(() => {
    if (cityQuery.length < 2) {
      return "Digite pelo menos 2 caracteres para buscar.";
    }
    if (isLoadingCities) {
      return "Carregando...";
    }
    return "Nenhum resultado encontrado.";
  }, [cityQuery.length, isLoadingCities]);

  const interestEmptyMessage = useMemo(() => {
    if (interestQuery.length < 2) {
      return "Digite pelo menos 2 caracteres para buscar.";
    }
    if (isLoadingInterests) {
      return "Carregando...";
    }
    return "Nenhum resultado encontrado.";
  }, [interestQuery.length, isLoadingInterests]);

  const addCity = (suggestion: CitySuggestion) => {
    setNewAudience((prev) => {
      if (prev.cities.some((city) => city.key === suggestion.id)) {
        return prev;
      }
      return {
        ...prev,
        cities: [
          ...prev.cities,
          {
            key: suggestion.id,
            radius: DEFAULT_CITY_RADIUS,
            distance_unit: "kilometer",
            name: suggestion.name,
            region: suggestion.region,
          },
        ],
      };
    });
    setCitySearchOpen(false);
  };

  const addInterest = (suggestion: InterestSuggestion) => {
    setNewAudience((prev) => {
      if (prev.interests.some((interest) => interest.id === suggestion.id)) {
        return prev;
      }
      return {
        ...prev,
        interests: [...prev.interests, { id: suggestion.id, name: suggestion.name }],
      };
    });
    setInterestSearchOpen(false);
  };

  const removeCity = (key: string) => {
    setNewAudience((prev) => ({
      ...prev,
      cities: prev.cities.filter((city) => city.key !== key),
    }));
  };

  const removeInterest = (id: string) => {
    setNewAudience((prev) => ({
      ...prev,
      interests: prev.interests.filter((interest) => interest.id !== id),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newAudience.name.trim();
    if (!trimmedName) {
      toast({
        title: "Nome obrigatório",
        description: "Informe um nome para o público.",
        variant: "destructive",
      });
      return;
    }

    const parsedAgeMin = Number.parseInt(newAudience.ageMin, 10);
    const parsedAgeMax = Number.parseInt(newAudience.ageMax, 10);

    if (!Number.isFinite(parsedAgeMin) || parsedAgeMin < MIN_AGE) {
      toast({
        title: "Idade mínima inválida",
        description: `A idade mínima deve ser um número entre ${MIN_AGE} e ${MAX_AGE}.`,
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(parsedAgeMax) || parsedAgeMax > MAX_AGE) {
      toast({
        title: "Idade máxima inválida",
        description: `A idade máxima deve ser um número entre ${MIN_AGE} e ${MAX_AGE}.`,
        variant: "destructive",
      });
      return;
    }

    if (parsedAgeMin > parsedAgeMax) {
      toast({
        title: "Faixa etária inválida",
        description: "A idade mínima não pode ser maior que a idade máxima.",
        variant: "destructive",
      });
      return;
    }

    if (newAudience.cities.length === 0) {
      toast({
        title: "Adicione pelo menos uma cidade",
        description: "Selecione uma cidade alvo para o público.",
        variant: "destructive",
      });
      return;
    }

    if (newAudience.interests.length === 0) {
      toast({
        title: "Adicione pelo menos um interesse",
        description: "Selecione um interesse para o público.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateAudiencePayload = {
      name: trimmedName,
      type: "interesse",
      ageMin: parsedAgeMin,
      ageMax: parsedAgeMax,
      cities: newAudience.cities.map((city) => ({
        key: city.key,
        radius: city.radius,
        distance_unit: city.distance_unit,
        name: city.name,
        region: city.region,
      })),
      interests: newAudience.interests.map((interest) => ({
        id: interest.id,
        name: interest.name,
      })),
      behaviors: [],
      locations: [],
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Públicos-Alvo</h1>
          <p className="text-muted-foreground">
            Configure os públicos que serão reutilizados nas campanhas
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-audience">
          <Plus className="h-4 w-4 mr-2" />
          Novo público
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : audiences.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">Nenhum público cadastrado ainda</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Clique em “Novo público” para cadastrar sua primeira segmentação.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {audiences.map((audience) => (
            <Card key={audience.id} data-testid={`card-audience-${audience.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{audience.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Faixa etária</p>
                  <p>
                    {audience.ageMin} - {audience.ageMax} anos
                  </p>
                </div>

                {audience.cities && audience.cities.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground">Cidades</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {audience.cities.map((city) => (
                        <Badge key={city.key} variant="outline" className="text-xs">
                          {city.name ?? city.key}
                          {city.region ? ` · ${city.region}` : ""}
                          <span className="ml-1 text-muted-foreground">
                            ({city.radius} km)
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {audience.interests && audience.interests.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground">Interesses</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {audience.interests.map((interest) => (
                        <Badge key={interest.id} variant="secondary" className="text-xs">
                          {interest.name}
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
                    disabled={deleteMutation.isPending}
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
            <DialogTitle>Criar novo público</DialogTitle>
            <DialogDescription>
              Defina o perfil de segmentação que será enviado para o Meta Ads.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="audience-name">Nome do público *</Label>
                <Input
                  id="audience-name"
                  placeholder="Ex: Leads 25-45"
                  value={newAudience.name}
                  onChange={(e) => setNewAudience({ ...newAudience, name: e.target.value })}
                  data-testid="input-audience-name"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age-min">Idade mínima *</Label>
                  <Input
                    id="age-min"
                    type="number"
                    min={MIN_AGE}
                    max={MAX_AGE}
                    placeholder={`${MIN_AGE}`}
                    value={newAudience.ageMin}
                    onChange={(e) => setNewAudience({ ...newAudience, ageMin: e.target.value })}
                    data-testid="input-age-min"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age-max">Idade máxima *</Label>
                  <Input
                    id="age-max"
                    type="number"
                    min={MIN_AGE}
                    max={MAX_AGE}
                    placeholder={`${MAX_AGE}`}
                    value={newAudience.ageMax}
                    onChange={(e) => setNewAudience({ ...newAudience, ageMax: e.target.value })}
                    data-testid="input-age-max"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cidades *</Label>
                <Popover open={citySearchOpen} onOpenChange={setCitySearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {newAudience.cities.length > 0
                        ? "Adicionar outra cidade"
                        : "Selecione cidades"}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0">
                    <Command>
                      <CommandInput
                        value={cityQuery}
                        onValueChange={setCityQuery}
                        placeholder="Digite uma cidade..."
                      />
                      <CommandList>
                        <CommandEmpty>{cityEmptyMessage}</CommandEmpty>
                        {cityResults.length > 0 && (
                          <CommandGroup>
                            {cityResults.map((city) => {
                              const displayValue = `${city.name} ${city.region ?? ""}`.trim();
                              return (
                                <CommandItem
                                  key={city.id}
                                  value={displayValue}
                                  onSelect={() => addCity(city)}
                                >
                                  <div>
                                    <p className="font-medium">{city.name}</p>
                                    {city.region && (
                                      <p className="text-xs text-muted-foreground">{city.region}</p>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {newAudience.cities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {newAudience.cities.map((city) => (
                      <Badge key={city.key} variant="outline" className="flex items-center gap-1 text-xs">
                        {city.name ?? city.key}
                        <span className="text-muted-foreground">({city.radius} km)</span>
                        <button
                          type="button"
                          className="ml-1 rounded-full p-0.5 hover:bg-muted"
                          onClick={() => removeCity(city.key)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Interesses *</Label>
                <Popover open={interestSearchOpen} onOpenChange={setInterestSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {newAudience.interests.length > 0
                        ? "Adicionar outro interesse"
                        : "Selecione interesses"}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0">
                    <Command>
                      <CommandInput
                        value={interestQuery}
                        onValueChange={setInterestQuery}
                        placeholder="Digite um interesse..."
                      />
                      <CommandList>
                        <CommandEmpty>{interestEmptyMessage}</CommandEmpty>
                        {interestResults.length > 0 && (
                          <CommandGroup>
                            {interestResults.map((interest) => (
                              <CommandItem
                                key={interest.id}
                                value={interest.name}
                                onSelect={() => addInterest(interest)}
                              >
                                {interest.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {newAudience.interests.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {newAudience.interests.map((interest) => (
                      <Badge key={interest.id} variant="secondary" className="flex items-center gap-1 text-xs">
                        {interest.name}
                        <button
                          type="button"
                          className="ml-1 rounded-full p-0.5 hover:bg-muted"
                          onClick={() => removeInterest(interest.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="button-save-audience"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Criando..." : "Criar público"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
