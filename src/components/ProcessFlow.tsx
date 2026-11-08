import { ArrowRight } from "lucide-react";
import type { Proces } from "@/lib/processen";

/** Stroomschema: stappen als vakjes met pijlen; keuzes als vertakkingen. */
export function ProcessFlow({ proces, uitgebreid = false }: { proces: Proces; uitgebreid?: boolean }) {
  return (
    <div className="break-inside-avoid rounded-md border bg-card p-3">
      <h3 className="mb-1 border-l-4 border-primary pl-2 font-black uppercase">{proces.titel}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{proces.doel}</p>
      <ol className="flex flex-wrap items-stretch gap-2">
        {proces.stappen.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className={`flex min-w-[8rem] max-w-[15rem] flex-col rounded-md border-2 p-2 text-sm ${s.keuze ? "border-dashed border-primary bg-accent" : "border-primary bg-background"}`}>
              <span className="font-mono text-xs text-muted-foreground">{s.keuze ? "Keuze" : `Stap ${i + 1}`}</span>
              <span className="font-bold">{s.titel}</span>
              {s.uitleg && <span className="text-xs">{s.uitleg}</span>}
              {s.keuze && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {s.keuze.map((k) => <li key={k}>◆ {k}</li>)}
                </ul>
              )}
            </div>
            {i < proces.stappen.length - 1 && <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          </li>
        ))}
      </ol>
      {uitgebreid && (proces.details.length > 0 || proces.letOp?.length) && (
        <div className="mt-3 space-y-2 text-sm">
          {proces.details.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">{proces.details.map((d) => <li key={d}>{d}</li>)}</ul>
          )}
          {proces.letOp?.length ? (
            <div className="rounded border-l-4 border-primary bg-muted p-2">
              <p className="text-xs font-bold uppercase">Let op</p>
              <ul className="list-disc pl-5">{proces.letOp.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
