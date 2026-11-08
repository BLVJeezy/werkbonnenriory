import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Share2, UserPlus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createAdminAccount, inviteExistingAdmin, listAdminUsers } from "@/lib/admin-users.functions";

export function AdminUsers() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminUsers), create = useServerFn(createAdminAccount), invite = useServerFn(inviteExistingAdmin);
  const { data: users = [], isPending, error } = useQuery({ queryKey: ["admin_users"], queryFn: () => list() });
  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<{ email: string; setupUrl: string } | null>(null);
  const message = invitation ? `Je bent uitgenodigd als beheerder van Riory Werkbonnen.\nE-mailadres: ${invitation.email}\nKies je eigen wachtwoord via deze eenmalige link:\n${invitation.setupUrl}\nDaarna meld je aan met je e-mailadres en wachtwoord. Je krijgt volledige beheertoegang.` : "";
  async function copy() {
    try { await navigator.clipboard.writeText(message); toast.success("Uitnodiging gekopieerd — plak ze in een mail of bericht."); }
    catch { toast.error("Kopiëren lukt niet. Selecteer en kopieer het bericht hieronder."); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: "Riory Werkbonnen — beheerderuitnodiging", text: message }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) toast.error("Delen mislukt. Kopieer de uitnodiging."); }
  }
  return <div className="space-y-4">
    <Tabs value={mode} onValueChange={(value) => { setMode(value === "create" ? "create" : "invite"); setPassword(""); }}>
      <TabsList><TabsTrigger value="invite">Uitnodigen</TabsTrigger><TabsTrigger value="create">Zelf aanmaken</TabsTrigger></TabsList>
    </Tabs>
    <p className="text-sm text-muted-foreground">Beheerders krijgen volledige toegang, inclusief facturen en boekhouding.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try {
        const result = await create({ data: mode === "create" ? { mode, email, password } : { mode, email } });
        setEmail(""); setPassword("");
        await qc.invalidateQueries({ queryKey: ["admin_users"] });
        if (result.setupUrl) setInvitation({ email: result.email, setupUrl: result.setupUrl });
        toast.success(result.setupUrl ? "Beheerder aangemaakt. Deel nu de uitnodiging." : "Beheerder aangemaakt.");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Aanmaken mislukt."); }
      finally { setBusy(false); }
    }}>
      <div className="min-w-0 flex-1 space-y-1 sm:max-w-sm"><Label htmlFor="admin-email">E-mailadres beheerder</Label><Input id="admin-email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {mode === "create" && <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs"><Label htmlFor="admin-password">Wachtwoord</Label><Input id="admin-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
      <Button disabled={busy} type="submit"><UserPlus className="size-4" />{busy ? "Bezig…" : mode === "invite" ? "Uitnodiging maken" : "Beheerder aanmaken"}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Beheerders ophalen mislukt."}</p>}
    {isPending && <p className="text-sm text-muted-foreground">Beheerders laden…</p>}
    <ul className="divide-y">
      {users.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-all font-semibold">{user.email}{user.self ? " (jij)" : ""}</p><p className="text-sm text-muted-foreground">{user.active ? "Al aangemeld" : "Nog niet aangemeld"}</p></div>
        {!user.self && <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
          if (!window.confirm(`Een nieuwe wachtwoordlink voor ${user.email} maken?`)) return;
          setBusy(true);
          try { setInvitation(await invite({ data: { id: user.id } })); }
          catch (error) { toast.error(error instanceof Error ? error.message : "Uitnodigen mislukt."); }
          finally { setBusy(false); }
        }}><Send className="size-4" />Uitnodigingslink</Button>}
      </li>)}
    </ul>
    <Dialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open) setInvitation(null); }}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Beheerder uitnodigen</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Deel deze persoonlijke, eenmalige link alleen met {invitation?.email}. Er is nog geen mail verstuurd.</p>
        <textarea aria-label="Beheerderuitnodiging" readOnly value={message} className="h-56 w-full resize-none rounded-md border bg-background p-3 text-sm text-foreground" />
        <div className="flex flex-wrap gap-2"><Button onClick={share}><Share2 className="size-4" />Delen</Button><Button variant="outline" onClick={copy}><Copy className="size-4" />Kopiëren</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}