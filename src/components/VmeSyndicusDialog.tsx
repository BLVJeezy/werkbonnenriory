import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SyndicusDir } from "@/lib/syndici";

type Props = {
  open: boolean;
  title: string;
  directory: SyndicusDir[];
  initialSyndicusId?: string | null;
  onClose: () => void;
  onConfirmExisting: (syndicus: SyndicusDir) => Promise<void> | void;
  onCreateAndConfirm: (company: string, contact: string) => Promise<void> | void;
  onConfirmPending: () => Promise<void> | void;
};

export function VmeSyndicusDialog({
  open,
  title,
  directory,
  initialSyndicusId,
  onClose,
  onConfirmExisting,
  onCreateAndConfirm,
  onConfirmPending,
}: Props) {
  const [selectedId, setSelectedId] = useState(initialSyndicusId ?? "");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCompany, setNewCompany] = useState("");
  const [newContact, setNewContact] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      if (creatingNew) {
        const company = newCompany.trim();
        if (!company) return;
        await onCreateAndConfirm(company, newContact.trim());
      } else {
        const found = directory.find((d) => d.id === selectedId);
        if (!found) return;
        await onConfirmExisting(found);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handlePending() {
    setBusy(true);
    try {
      await onConfirmPending();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welke syndicus is verantwoordelijk voor deze VME?</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {!creatingNew ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="block text-xs font-bold uppercase text-muted-foreground">Bestaande syndicus</span>
                <SearchableSelect
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">— kies een syndicus —</option>
                  {directory.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.company}{d.city ? ` (${d.city})` : ""}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
              <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setCreatingNew(true)}>
                + Nieuwe syndicus aanmaken en koppelen
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <label className="block space-y-1">
                <span className="block text-xs font-bold uppercase text-muted-foreground">Bedrijfsnaam syndicus *</span>
                <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Bijv. Immo Schrijnemakers BV" />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-bold uppercase text-muted-foreground">Contactpersoon</span>
                <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} placeholder="Optioneel" />
              </label>
              <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setCreatingNew(false)}>
                ← Terug naar bestaande syndici
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handlePending}>
            Nog toe te wijzen
          </Button>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
              Annuleren
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || (creatingNew ? !newCompany.trim() : !selectedId)}
              onClick={handleConfirm}
            >
              {busy ? "Opslaan…" : "Opslaan"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}