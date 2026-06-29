import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { FilterOption } from "../types";
import { buildDefaultRange, labelFromRange, normalizeRange } from "../utils";

export function AccountMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

export function FilterCombobox({
  label,
  placeholder,
  emptyLabel,
  options,
  value,
  onChange,
  testId,
  className,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  emptyLabel: string;
  options: FilterOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  testId: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>

      <Popover
        open={open && !disabled}
        onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            data-testid={testId}
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="truncate text-left">
              {selected ? (
                <>
                  <span className="font-medium">{selected.label}</span>
                  {selected.description && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      — {selected.description}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 w-[260px] p-0"
        >
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}`} className="text-sm" />
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </CommandEmpty>
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")}
                  />
                  Todas
                </CommandItem>

                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="truncate text-sm font-medium leading-tight">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="truncate text-xs leading-tight text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function MultiFilterCombobox({
  label,
  placeholder,
  emptyLabel,
  options,
  values,
  onChange,
  testId,
  className,
}: {
  label: string;
  placeholder: string;
  emptyLabel: string;
  options: FilterOption[];
  values: string[];
  onChange: (next: string[]) => void;
  testId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => values.includes(option.value));
  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]?.label ?? placeholder
        : `${selected.length} contas selecionadas`;

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((entry) => entry !== value));
      return;
    }
    onChange([...values, value]);
  };

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            data-testid={testId}
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate text-left">
              {selected.length > 0 ? (
                <span className="font-medium">{triggerLabel}</span>
              ) : (
                <span className="text-muted-foreground">{triggerLabel}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 w-[320px] p-0"
        >
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}`} className="text-sm" />
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </CommandEmpty>
            <CommandList>
              <CommandGroup>
                <CommandItem value="__all__" onSelect={() => onChange([])}>
                  <Check
                    className={cn("mr-2 h-4 w-4", values.length === 0 ? "opacity-100" : "opacity-0")}
                  />
                  Todas as contas
                </CommandItem>

                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description ?? ""}`.trim()}
                    onSelect={() => toggleValue(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        values.includes(option.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="truncate text-sm font-medium leading-tight">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="truncate text-xs leading-tight text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function DateRangePickerField({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(value);
  const currentLabel = labelFromRange(value);

  const handleSelect = (next: DateRange | undefined) => {
    if (!next || !next.from) {
      setDraftRange(undefined);
      onChange(null);
      return;
    }
    if (!next.to) {
      setDraftRange({ from: next.from, to: undefined });
      return;
    }
    const normalized = normalizeRange(next);
    setDraftRange(normalized);
    onChange(normalized);
    setOpen(false);
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Período
      </span>

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setDraftRange(value);
            return;
          }
          setDraftRange(undefined);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{currentLabel}</span>
            <ChevronsUpDown className="ml-auto h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent side="bottom" align="start" sideOffset={8} className="z-50 w-auto p-0">
          <div className="flex flex-col gap-3 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Selecione o período
            </div>

            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draftRange}
              disabled={{ after: new Date() }}
              onSelect={handleSelect}
            />

            <div className="flex justify-between">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  const normalized = normalizeRange(buildDefaultRange());
                  setDraftRange(normalized);
                  onChange(normalized);
                  setOpen(false);
                }}
              >
                Voltar padrão
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  setDraftRange(undefined);
                  onChange(null);
                  setOpen(false);
                }}
              >
                Limpar período
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AwaitingFilterCard({
  isSharedMode,
}: {
  isSharedMode: boolean;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {isSharedMode
          ? "Carregando dashboard compartilhado..."
          : "Selecione ao menos uma conta de anúncio para carregar os dados do dashboard."}
      </CardContent>
    </Card>
  );
}
