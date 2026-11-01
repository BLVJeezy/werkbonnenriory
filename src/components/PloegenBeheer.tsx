import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTechnicianLogin, deleteTechnician } from "@/lib/technicians.functions";
import { createExternalCrew } from "@/lib/appointments.functions";
import { MarketingUsers } from "@/components/MarketingUsers";
import { Copy, MessageCircle, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { crewInvitationText, crewWhatsAppLink } from "@/lib/crew-whatsapp";
import { inviteCrewPassword } from "@/lib/crew-invitation.functions";

const empty = { name: "", phone: "" };

export function PloegenBeheer() {
  const qc = useQueryClient();
  const create = useServerFn(createTechnicianLogin);
  const invite = useServerFn(inviteCrewPassword);
  const createExternal = useServerFn(createExternalCrew);
  const [external, setExternal] = useState({ name: "", email: "" });
  const remove = useServerFn(deleteTechnician);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<{ name: string; phone: string; setupUrl: string } | null>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const invitationText = invitation ? crewInvitationText(invitation.name, invitation.setupUrl) : "";
  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitationText);
      toast.success("Uitnodiging gekopieerd. Plak het bericht in WhatsApp bij de ploeg.");
    } catch {
      messageField.current?.focus();
      messageField.current?.select();
      toast.info("Selecteer en kopieer het bericht hieronder en plak het in WhatsApp.");
    }
  }
  async function shareInvitation() {
    if (!navigator.share) { await copyInvitation(); return; }
    try { await navigator.share({ text: invitationText }); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyInvitation();
    }
  }
  let invitationLink = "";
  let invitationError = "";
  if (invitation) {
    try { invitationLink = crewWhatsAppLink(invitation.name, invitation.phone, invitation.setupUrl); }
    catch (error) { invitationError = error instanceof Error ? error.message : "Ongeldig telefoonnummer"; }
  }
  const { data = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => (await supabase.from("technicians").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await create({ data: f });
      toast.success(`Login aangemaakt voor ploeg ${f.name}`);
      setInvitation({ name: f.name.trim(), phone: f.phone, setupUrl: result.setupUrl });
      setF(empty);
      qc.invalidateQueries({ queryKey: ["technicians"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form className="grid gap-3 border-b pb-5 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await createExternal({ data: external }); setExternal({ name: "", email: "" }); qc.invalidateQueries({ queryKey: ["technicians"] }); toast.success("Externe ploeg toegevoegd zonder login"); } catch (e) { toast.error(e instanceof Error ? e.message : "Aanmaken mislukt"); } finally { setBusy(false); } }}>
        <Input aria-label="Naam externe ploeg" placeholder="Naam externe ploeg" required value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value })} />
        <Input aria-label="E-mailadres externe ploeg" type="email" placeholder="E-mailadres externe ploeg" required value={external.email} onChange={(e) => setExternal({ ...external, email: e.target.value })} />
        <Button disabled={busy}>Externe ploeg toevoegen</Button>
      </form>
      <form onSubmit={add} className="grid gap-2 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Input placeholder="Naam ploeg (= loginnaam)" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Telefoon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Button disabled={busy} className="sm:col-span-2">
          {busy ? "Aanmaken…" : "Ploeg + login aanmaken"}
        </Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen ploegen.</li>}
        {data.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2 font-bold">
                <input
                  type="color"
                  title="Kleur van deze ploeg"
                  className="h-8 w-10 cursor-pointer rounded border"
                  defaultValue={t.color ?? "#f97316"}
                  onChange={async (e) => {
                    await supabase.from("technicians").update({ color: e.target.value }).eq("id", t.id);
                    qc.invalidateQueries({ queryKey: ["technicians"] });
                    qc.invalidateQueries({ queryKey: ["work_orders"] });
                  }}
                />
                {t.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {[t.external_planning ? `Externe ploeg · ${t.email} · geen systeemtoegang` : t.user_id ? `login: ${t.name}` : "geen login", t.phone].filter(Boolean).join(" · ")}
              </div>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const patch: { name?: string; phone: string | null; email?: string | null; ccv_terminal_id?: string | null } = { phone: String(fd.get("phone") ?? "").trim() || null };
                  if (!t.external_planning) patch.ccv_terminal_id = String(fd.get("ccv") ?? "").replace(/\s/g, "") || null;
                  if (!t.user_id) patch.name = String(fd.get("name") ?? "").trim() || t.name;
                  if (t.external_planning) patch.email = String(fd.get("email") ?? "").trim() || t.email;
                  const { error } = await supabase.from("technicians").update(patch).eq("id", t.id);
                  if (error) toast.error("Opslaan mislukt");
                  else { toast.success("Ploeggegevens opgeslagen"); qc.invalidateQueries({ queryKey: ["technicians"] }); qc.invalidateQueries({ queryKey: ["work_orders"] }); }
                }}
              >
                <Input name="name" aria-label="Naam ploeg" className="h-8 w-40" defaultValue={t.name} disabled={!!t.user_id} title={t.user_id ? "Naam is de loginnaam en kan niet gewijzigd worden" : undefined} />
                <Input name="phone" aria-label="Telefoon ploeg" placeholder="Telefoon" className="h-8 w-36" defaultValue={t.phone ?? ""} />
                {!t.external_planning && <Input name="ccv" aria-label="CCV Terminal ID" placeholder="CCV Terminal ID" className="h-8 w-40" defaultValue={t.ccv_terminal_id ?? ""} />}
                {t.external_planning && <Input name="email" type="email" required aria-label="E-mailadres ploeg" className="h-8 w-56" defaultValue={t.email ?? ""} />}
                <Button size="sm" variant="outline" type="submit">Opslaan</Button>
                {!t.external_planning && t.user_id && <Button size="sm" variant="outline" type="button" disabled={busy} onClick={async () => {
                  if (!confirm(`Een persoonlijke wachtwoordlink maken voor ${t.name}? Een eerdere uitnodigingslink vervalt. Het huidige wachtwoord blijft geldig tot de ploeg een nieuw kiest.`)) return;
                  setBusy(true);
                  try { const result = await invite({ data: { id: t.id } }); setInvitation({ name: t.name, phone: t.phone ?? "", setupUrl: result.setupUrl }); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Uitnodigen mislukt"); }
                  finally { setBusy(false); }
                }}><MessageCircle className="size-4" />Uitnodigen via WhatsApp</Button>}
              </form>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {(
                  [
                    ["show_prices", "Prijzen en totaal"],
                    ["show_contact", "Klantgegevens"],
                    ["can_payment", "Afrekenen"],
                    ["show_signed", "Afgetekende werkbonnen"],
                    ["large_text", "Extra grote letters"],
                    ["manual_time_entry", "Tijd manueel invullen"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={t[k]}
                      disabled={t.external_planning && (k === "show_prices" || k === "can_payment")}
                      onChange={async (e) => {
                        await supabase.from("technicians").update({ [k]: e.target.checked } as { show_prices: boolean }).eq("id", t.id);
                        qc.invalidateQueries({ queryKey: ["technicians"] });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm(`${t.name} en de login verwijderen?`)) return;
                try {
                  await remove({ data: { id: t.id } });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Mislukt");
                }
                qc.invalidateQueries({ queryKey: ["technicians"] });
              }}
            >
              Verwijderen
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={invitation !== null} onOpenChange={(open) => { if (!open) setInvitation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{invitation?.name} uitnodigen</DialogTitle>
            <DialogDescription>De ploeg krijgt haar loginnaam, uitleg voor de werkbon en een persoonlijke link om zelf een wachtwoord te kiezen. De link is 72 uur geldig. Je verstuurt het bericht zelf in WhatsApp.</DialogDescription>
          </DialogHeader>
          <Input aria-label="WhatsApp-telefoonnummer" type="tel" placeholder="Bijvoorbeeld +32 470 12 34 56" value={invitation?.phone ?? ""} onChange={(e) => setInvitation((current) => current ? { ...current, phone: e.target.value } : null)} />
          {invitationError && <p className="text-sm text-destructive" role="alert">{invitationError}</p>}
          <Button asChild disabled={!invitationLink}>
            {invitationLink ? <a href={invitationLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />Openen in WhatsApp</a> : <span><MessageCircle className="size-4" />Openen in WhatsApp</span>}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={shareInvitation}><Share2 className="size-4" />Delen</Button>
            <Button type="button" variant="outline" onClick={copyInvitation}><Copy className="size-4" />Bericht kopiëren</Button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Uitnodigingsbericht</summary>
            <textarea ref={messageField} aria-label="Uitnodigingsbericht" readOnly value={invitationText} className="mt-2 h-48 w-full resize-none rounded-md border bg-background p-3 text-foreground" />
          </details>
          <p className="text-sm text-muted-foreground">WhatsApp geblokkeerd? Kopieer het bericht en plak het rechtstreeks in WhatsApp. Bewaar de persoonlijke link alleen voor deze ploeg.</p>
        </DialogContent>
      </Dialog>
      <MarketingUsers />
    </div>
  );
}
