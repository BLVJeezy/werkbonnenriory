import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { searchSystem } from "@/lib/global-search.functions";
import { CATEGORY_LABELS, type GlobalSearchItem, type SearchCategory } from "@/lib/global-search";

export function GlobalSearch() {
  const navigate = useNavigate();
  const runSearch = useServerFn(searchSystem);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GlobalSearchItem[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await runSearch({ data: { query: trimmed } });
        if (reqId.current === id) setItems(res.items);
      } catch (err) {
        if (reqId.current === id) setError((err as Error).message || "Zoeken mislukt");
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, open, runSearch]);

  const grouped = useMemo(() => {
    const map = new Map<SearchCategory, GlobalSearchItem[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [items]);

  function openItem(item: GlobalSearchItem) {
    setOpen(false);
    navigate({
      to: item.to as any,
      ...(item.params ? { params: item.params as any } : {}),
      ...(item.search ? { search: item.search as any } : {}),
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Zoeken in het hele systeem"
      >
        <Search className="mr-1.5 size-4" />
        Zoeken
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col gap-3 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Zoeken in het volledige systeem</DialogTitle>
            <DialogDescription>
              Typ een naam, factuurnummer, adres, omschrijving, IBAN of trefwoord (minstens 2 tekens).
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op klant, werkbon, factuur, leverancier, product, bank…"
              className="pl-9 pr-9"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && !error && query.trim().length >= 2 && items.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Geen resultaten gevonden voor “{query.trim()}”.
              </p>
            )}
            {grouped.map(([cat, list]) => (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    {list.length}
                  </Badge>
                </div>
                <div className="divide-y divide-border rounded-md border border-border bg-card">
                  {list.map((item) => (
                    <button
                      key={`${item.category}-${item.id}`}
                      type="button"
                      onClick={() => openItem(item)}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                        )}
                      </div>
                      {item.meta && (
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.meta}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}