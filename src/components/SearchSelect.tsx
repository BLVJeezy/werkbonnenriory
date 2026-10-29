import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterChoices, type SearchChoice } from "@/lib/choice-search";
import { cn } from "@/lib/utils";

type Props = {
  options: SearchChoice[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  id?: string;
  className?: string;
};

export function SearchSelect({ options, value, onChange, placeholder, searchPlaceholder = "Zoeken…", id, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = filterChoices(options, query);
  const selected = options.find(option => option.value === value);
  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={placeholder} className={cn("h-10 w-full min-w-0 max-w-full justify-between gap-2 overflow-hidden font-normal", className)}>
          <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput autoFocus aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {matches.length === 0 && <p className="p-4 text-sm text-muted-foreground">Geen resultaten.</p>}
            {matches.slice(0, 80).map(option => (
              <CommandItem key={option.value} value={option.value} onSelect={() => { onChange(option.value); setOpen(false); setQuery(""); }} className="items-start py-2">
                <span className="min-w-0 flex-1 break-words">{option.label}</span>
                {value === option.value && <Check className="mt-0.5 size-4 shrink-0" />}
              </CommandItem>
            ))}
            {matches.length > 80 && <p className="border-t p-2 text-xs text-muted-foreground">{matches.length} resultaten</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}