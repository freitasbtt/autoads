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
};

type DriveFolderComboboxProps = {
  folders: DriveFolderOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  testId?: string;
};

export function DriveFolderCombobox({
  folders,
  value,
  onChange,
  placeholder = "Pesquisar pasta",
  emptyLabel = "Nenhuma pasta encontrada",
  testId,
}: DriveFolderComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
    }
  }, [open]);

  const selected = folders.find((folder) => folder.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const enriched = folders.map((folder) => ({
      folder,
      nameLower: folder.name.toLowerCase(),
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

    return pool.slice(0, 3).map((item) => item.folder);
  }, [folders, query]);

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid={testId}
        >
          <span className="truncate text-left">
            {selected ? selected.name : placeholder}
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
            <CommandEmpty>{emptyLabel}</CommandEmpty>
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
