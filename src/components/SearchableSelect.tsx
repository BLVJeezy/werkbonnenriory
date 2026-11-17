import { Children, isValidElement, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterChoices } from "@/lib/choice-search";
import { cn } from "@/lib/utils";

/** Lists with at least this many options get a search field; shorter lists stay a plain dropdown. */
export const SEARCH_THRESHOLD = 7;

type Opt = { value: string; label: string; disabled?: boolean | undefined };

const text = (node: ReactNode): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return "";
};

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, child => {
    if (!isValidElement<{ children?: ReactNode; value?: unknown; disabled?: boolean }>(child)) return;
    if (child.type === "option") {
      const label = text(child.props.children);
      out.push({ value: child.props.value == null ? label : String(child.props.value), label, disabled: child.props.disabled });
    } else collect(child.props.children, out);
  });
  return out;
}

/** Drop-in replacement for a native single <select> that adds a search box to long lists. */
export function SearchableSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, value, onChange, className, disabled, id, multiple, ...rest } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = collect(children);
  if (multiple || options.length < SEARCH_THRESHOLD) return <select {...props} />;
  const current = value == null ? (options[0]?.value ?? "") : String(value);
  const selected = options.find(o => o.value === current);
  const matches = filterChoices(options, query) as Opt[];
  const pick = (v: string) => {
    setOpen(false); setQuery("");
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>);
  };
  return (
    <Popover modal open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} role="combobox" aria-expanded={open} aria-label={rest["aria-label"]} title={rest.title} disabled={disabled}
          className={cn("flex min-w-0 items-center justify-between gap-2 overflow-hidden text-left disabled:opacity-50", className)}>
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? ""}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput autoFocus placeholder="Zoeken…" aria-label="Zoeken" value={query} onValueChange={setQuery} />
          <CommandList>
            {matches.length === 0 && <p className="p-4 text-sm text-muted-foreground">Geen resultaten.</p>}
            {matches.slice(0, 150).map(o => (
              <CommandItem key={o.value} value={o.value} disabled={!!o.disabled} onSelect={() => pick(o.value)} className="items-start py-2">
                <span className="min-w-0 flex-1 break-words">{o.label}</span>
                {o.value === current && <Check className="mt-0.5 size-4 shrink-0" />}
              </CommandItem>
            ))}
            {matches.length > 150 && <p className="border-t p-2 text-xs text-muted-foreground">{matches.length} resultaten — typ verder om te verfijnen</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
