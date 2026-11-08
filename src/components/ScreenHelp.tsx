import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processenVoorScherm } from "@/lib/processen";
import { ProcessFlow } from "@/components/ProcessFlow";

const KEY = "riory-scherm-hulp";
const EVENT = "riory-scherm-hulp";

export function useScreenHelp() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(localStorage.getItem(KEY) === "1");
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const toggle = () => { localStorage.setItem(KEY, on ? "0" : "1"); window.dispatchEvent(new Event(EVENT)); };
  return { on, toggle };
}

/** Knop in het menu van de beheerder om de processchema's per scherm aan of uit te zetten. */
export function ScreenHelpToggle({ className }: { className?: string }) {
  const { on, toggle } = useScreenHelp();
  return (
    <Button size="sm" variant={on ? "default" : "ghost"} aria-pressed={on} onClick={toggle} className={className} title="Uitleg per scherm tonen">
      <HelpCircle /> Hulp {on ? "aan" : "uit"}
    </Button>
  );
}

/** Toont de stroomschema's van de processen op het huidige scherm wanneer de hulp aan staat. */
export function ScreenHelpPanel() {
  const { on } = useScreenHelp();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);
  if (!on) return null;
  const lijst = processenVoorScherm(pathname, "admin");
  if (!lijst.length) return null;
  return (
    <section className="no-print mx-auto mb-2 w-full max-w-5xl px-2 pt-3 sm:px-4">
      <div className="rounded-md border-2 border-primary bg-accent p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-black uppercase">Hoe werkt dit scherm?</p>
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "Inklappen" : "Uitklappen"}</Button>
        </div>
        {open && <div className="mt-3 space-y-3">{lijst.map((p) => <ProcessFlow key={p.id} proces={p} uitgebreid />)}</div>}
      </div>
    </section>
  );
}
