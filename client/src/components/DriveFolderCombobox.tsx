import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type DriveFolderOption = {
  id: number | string;
  name: string;
  value: string;
  searchText?: string;
};

type DriveFolderComboboxProps = {
  folders: DriveFolderOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  testId?: string;
  disabled?: boolean;
  maxResults?: number;
  minSearchLength?: number;
  onSearch?: (query: string) => Promise<DriveFolderOption[]>;
};

export function DriveFolderCombobox({
  folders,
  value,
  onChange,
  placeholder = "Pesquisar pasta",
  emptyLabel = "Nenhuma pasta encontrada",
  testId,
  disabled = false,
  maxResults = 3,
  minSearchLength = 0,
  onSearch,
}: DriveFolderComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<DriveFolderOption[]>([]);
  const [knownOptions, setKnownOptions] = useState<DriveFolderOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !disabled) {
      setQuery("");
    }
  }, [open, disabled]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const selectedPool = useMemo(() => {
    const map = new Map<string, DriveFolderOption>();
    folders.forEach((folder) => {
      map.set(folder.value, folder);
    });
    knownOptions.forEach((folder) => {
      if (!map.has(folder.value)) {
        map.set(folder.value, folder);
      }
    });
    remoteOptions.forEach((folder) => {
      if (!map.has(folder.value)) {
        map.set(folder.value, folder);
      }
    });
    return map;
  }, [folders, knownOptions, remoteOptions]);

  const selected = selectedPool.get(value);

  useEffect(() => {
    if (!onSearch || !open || disabled) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < minSearchLength) {
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let isActive = true;
    setIsSearching(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await onSearch(trimmed);
        if (!isActive) return;
        setRemoteOptions(results);
        setKnownOptions((prev) => {
          const map = new Map(prev.map((item) => [item.value, item]));
          results.forEach((item) => {
            map.set(item.value, item);
          });
          return Array.from(map.values());
        });
      } catch (error) {
        if (!isActive) return;
        setRemoteOptions([]);
        setSearchError("Falha ao buscar");
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [disabled, minSearchLength, onSearch, open, query]);

  const filtered = useMemo(() => {
    if (onSearch) {
      const trimmed = query.trim();
      if (trimmed.length < minSearchLength) {
        return [];
      }
      return remoteOptions.slice(0, maxResults);
    }

    const q = query.trim().toLowerCase();
    const enriched = folders.map((folder) => ({
      folder,
      nameLower: (folder.searchText ?? folder.name).toLowerCase(),
    }));

    const pool = q
      ? enriched
          .filter((item) => item.nameLower.includes(q))
          .sort((a, b) => {
            const aIndex = a.nameLower.indexOf(q);
            const bIndex = b.nameLower.indexOf(q);
            if (aIndex !== bIndex) return aIndex - bIndex;
            return a.folder.name.localeCompare(b.folder.name);
          })
      : enriched.sort((a, b) =>
          a.folder.name.localeCompare(b.folder.name),
        );

    return pool.slice(0, maxResults).map((item) => item.folder);
  }, [folders, maxResults, query]);

  const handleSelect = (next: string) => {
    const option = selectedPool.get(next);
    if (option) {
      setKnownOptions((prev) => {
        const map = new Map(prev.map((item) => [item.value, item]));
        map.set(option.value, option);
        return Array.from(map.values());
      });
    }
    onChange(next);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid={testId}
          disabled={disabled}
        >
          <span className="truncate text-left">
            {selected ? selected.name : value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(400px,90vw)] p-0"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite para buscar"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {onSearch && query.trim().length < minSearchLength
                ? `Digite pelo menos ${minSearchLength} caracteres`
                : isSearching
                  ? "Buscando..."
                  : searchError ?? emptyLabel}
            </CommandEmpty>
            {filtered.length > 0 && (
              <CommandGroup heading="Sugestoes">
                {filtered.map((folder) => (
                  <CommandItem
                    key={folder.value}
                    value={folder.value}
                    onSelect={() => handleSelect(folder.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === folder.value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="truncate">{folder.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
