import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { validateSectorName, type CustomerSector } from "@/lib/customer-categories";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectors: CustomerSector[];
  customerCounts: Record<string, number>;
  onChanged: () => void;
};

export function CustomerSectorsDialog({ open, onOpenChange, sectors, customerCounts, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSectors = sectors.filter((s) => !s.archived_at);
  const archivedSectors = sectors.filter((s) => !!s.archived_at);

  async function handleAdd() {
    const res = validateSectorName(newName, sectors);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("customer_sectors").insert({ name: res.name });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Deze sector bestaat al." : error.message);
      return;
    }
    toast.success(`Sector '${res.name}' toegevoegd`);
    setNewName("");
    onChanged();
  }

  async function handleRename(sector: CustomerSector) {
    const res = validateSectorName(editingName, sectors, sector.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("customer_sectors")
      .update({ name: res.name, updated_at: new Date().toISOString() })
      .eq("id", sector.id);
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Er bestaat al een sector met deze naam." : error.message);
      return;
    }
    toast.success(`Sector hernoemd naar '${res.name}'`);
    setEditingId(null);
    setEditingName("");
    onChanged();
  }

  async function handleToggleArchive(sector: CustomerSector) {
    const archiving = !sector.archived_at;
    const count = customerCounts[sector.id] ?? 0;
    if (archiving && count > 0) {
      const ok = confirm(
        `Sector '${sector.name}' archiveren? Deze sector is nog gekoppeld aan ${count} klant${count === 1 ? "" : "en"}. Bestaande koppelingen blijven zichtbaar en behouden, maar nieuwe toewijzingen zijn verborgen.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("customer_sectors")
      .update({
        archived_at: archiving ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sector.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(archiving ? `Sector '${sector.name}' gearchiveerd` : `Sector '${sector.name}' heractiveerd`);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sectoren beheren</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Voeg eigen subcategorieën/sectoren toe (bv. Horeca, Bouwbedrijven, Retail, Kantoren). Archiveren behoudt alle bestaande klantkoppelingen.
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Nieuwe sectornaam"
            placeholder="Nieuwe sector (bv. Horeca)…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
            disabled={busy}
          />
          <Button type="button" onClick={handleAdd} disabled={busy || !newName.trim()}>
            Toevoegen
          </Button>
        </div>

        <div className="space-y-2 pt-2">
          <div className="text-xs font-bold uppercase text-muted-foreground">Actieve sectoren ({activeSectors.length})</div>
          {activeSectors.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Nog geen sectoren aangemaakt.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {activeSectors.map((s) => {
                const count = customerCounts[s.id] ?? 0;
                const isEditing = editingId === s.id;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                    {isEditing ? (
                      <>
                        <Input
                          aria-label={`Nieuwe naam voor ${s.name}`}
                          className="h-8 flex-1"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRename(s); } }}
                          disabled={busy}
                        />
                        <Button size="sm" onClick={() => handleRename(s)} disabled={busy}>Opslaan</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={busy}>Annuleren</Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{count} klant{count === 1 ? "" : "en"}</span>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(s.id); setEditingName(s.name); }} disabled={busy}>
                          Hernoemen
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleToggleArchive(s)} disabled={busy}>
                          Archiveren
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {archivedSectors.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold uppercase text-muted-foreground">Gearchiveerde sectoren ({archivedSectors.length})</div>
            <ul className="divide-y rounded-md border bg-muted/20">
              {archivedSectors.map((s) => {
                const count = customerCounts[s.id] ?? 0;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{count} klant{count === 1 ? "" : "en"}</span>
                    <Button size="sm" variant="outline" onClick={() => handleToggleArchive(s)} disabled={busy}>
                      Heractiveren
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}