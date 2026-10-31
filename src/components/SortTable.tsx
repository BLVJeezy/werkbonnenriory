import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { sortRows, type SortDir, type SortValue } from "@/lib/sort-rows";
import type { RowState } from "@/lib/invoice-row-state";
import { cn } from "@/lib/utils";

export function useSort<T, K extends string>(rows: T[], getters: Record<K, (row: T) => SortValue>, initial: NoInfer<K> | null = null, initialDir: SortDir = "asc") {
  const [key, setKey] = useState<K | null>(initial);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => (key ? sortRows(rows, getters[key], dir) : rows), [rows, key, dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: K) => {
    if (k === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("asc"); }
  };
  return { sorted, key, dir, toggle };
}

/** Klikbare kolomkop; klik nogmaals om de volgorde om te draaien. */
export function SortTh<K extends string>({ k, sort, children, className, right }: { k: K; sort: { key: K | null; dir: SortDir; toggle: (k: K) => void }; children: React.ReactNode; className?: string; right?: boolean }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground", right ? "text-right" : "text-left", className)} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort.toggle(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {children}<Icon className="h-3 w-3" aria-hidden="true" />
      </button>
    </th>
  );
}

export function Th({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <th className={cn("whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground", right ? "text-right" : "text-left", className)}>{children}</th>;
}

/** Rijkleur voor de facturenlijst: groen = betaald, wit = open, rood = vervallen. */
export const rowTint: Record<RowState, string> = {
  paid: "[&_td]:bg-paid",
  open: "",
  overdue: "[&_td]:bg-overdue",
};

export const tableWrap = "overflow-x-auto rounded-md border bg-card";
export const tableCls = "w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-muted/40 [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle";
