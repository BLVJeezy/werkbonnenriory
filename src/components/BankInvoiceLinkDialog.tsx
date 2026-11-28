import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Op iOS blijft 100dvh achter het geopende toetsenbord staan. De visuele viewport
// geeft de werkelijk zichtbare hoogte én verschuiving voor deze mobiele dialoog.
function useMobileDialogViewport(open: boolean): CSSProperties | undefined {
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) {
      setViewport(null);
      return;
    }
    const mobile = window.matchMedia("(max-width: 639px)");
    const update = () => {
      const visual = window.visualViewport;
      setViewport(mobile.matches && visual ? { height: Math.max(240, Math.round(visual.height)), top: Math.max(0, Math.round(visual.offsetTop)) } : null);
    };
    update();
    mobile.addEventListener("change", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      mobile.removeEventListener("change", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [open]);
  if (!viewport) return undefined;
  return { "--bank-dialog-height": `${viewport.height}px`, "--bank-dialog-offset": `${viewport.top}px` } as CSSProperties;
}

type BankInvoiceLinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  search: ReactNode;
  results: ReactNode;
  selection?: ReactNode;
  refund?: ReactNode;
  actions: ReactNode;
};

/** Alleen de visuele schil; zoeken, kiezen en afletteren blijven in de bestaande Bank-component. */
export function BankInvoiceLinkDialog({ open, onOpenChange, description, search, results, selection, refund, actions }: BankInvoiceLinkDialogProps) {
  const mobileDialogViewport = useMobileDialogViewport(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={mobileDialogViewport}
        className="left-0 top-[var(--bank-dialog-offset,0px)] flex h-[var(--bank-dialog-height,100dvh)] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden rounded-none p-4 sm:left-[50%] sm:top-[50%] sm:grid sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:overflow-y-auto sm:rounded-xl sm:p-6"
      >
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Bankverrichting aan factuur koppelen</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {search}
        <div data-testid="bank-invoice-results" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] sm:max-h-72 sm:flex-none">
          {results}
        </div>
        {selection}
        {refund}
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] pt-3 sm:border-0 sm:pb-0 sm:pt-0">
          {actions}
        </div>
      </DialogContent>
    </Dialog>
  );
}
