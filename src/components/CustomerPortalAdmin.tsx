import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, ShieldOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCustomerPortalInvite,
  listCustomerPortalAccounts,
  setCustomerPortalActive,
} from "@/lib/customer-portal.functions";

type PortalAccount = {
  id: string;
  email: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  revoked_at: string | null;
};

export function CustomerPortalAdmin({
  customerId,
  defaultEmail,
}: {
  customerId: string;
  defaultEmail: string;
}) {
  const listFn = useServerFn(listCustomerPortalAccounts);
  const inviteFn = useServerFn(createCustomerPortalInvite);
  const toggleFn = useServerFn(setCustomerPortalActive);

  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [email, setEmail] = useState(defaultEmail);
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const rows = await listFn({ data: { customerId } });
      setAccounts(rows);
    } catch {
      // Ignore if not loaded yet
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleInvite() {
    if (!email.trim()) {
      toast.error("Vul een e-mailadres in voor de portaaluitnodiging.");
      return;
    }
    setBusy(true);
    try {
      const res = await inviteFn({ data: { customerId, email: email.trim() } });
      setInviteUrl(res.inviteUrl);
      toast.success(
        "Eenmalige uitnodigingslink (72u geldig) aangemaakt. Er is nog geen mail verzonden.",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uitnodiging aanmaken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(acc: PortalAccount) {
    setBusy(true);
    try {
      await toggleFn({ data: { accountId: acc.id, active: !acc.active } });
      toast.success(
        acc.active ? "Portaaltoegang ingetrokken." : "Portaaltoegang opnieuw geactiveerd.",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status wijzigen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Uitnodigingslink gekopieerd.");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-primary">
        <KeyRound className="size-3.5" />
        Klantenportaal (www.riory.be/klantportaal)
      </div>
      <p className="text-xs text-muted-foreground">
        Klanten kunnen zelf inloggen met het e-mailadres van hun facturen of werkbonnen: ze krijgen
        een inloglink per mail. Een uitnodiging is enkel nodig voor een ander e-mailadres.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          className="h-8 max-w-xs text-sm"
          placeholder="klant@voorbeeld.be"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleInvite}>
          Uitnodigingslink maken (72u)
        </Button>
      </div>
      {inviteUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
          <code className="flex-1 break-all font-mono">{inviteUrl}</code>
          <Button type="button" size="sm" variant="secondary" onClick={copyInvite}>
            <Copy className="mr-1 size-3.5" />
            Kopieer
          </Button>
        </div>
      )}
      {accounts.length > 0 && (
        <div className="space-y-1.5 text-xs">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card px-2.5 py-1.5"
            >
              <div>
                <span className="font-medium">{acc.email}</span>
                <span className="ml-2 text-muted-foreground">
                  {acc.active ? "Actief" : "Ingetrokken"}
                  {acc.last_login_at
                    ? ` · laatste login ${new Date(acc.last_login_at).toLocaleDateString("nl-BE")}`
                    : ""}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => handleToggle(acc)}
              >
                {acc.active ? (
                  <>
                    <ShieldOff className="mr-1 size-3.5" />
                    Intrekken
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-1 size-3.5" />
                    Activeren
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
