import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendWerkbonEmail } from "@/lib/werkbon-mail.functions";

/** Mailt een afgetekende werkbon rechtstreeks naar de klant vanuit een lijst. */
export function WerkbonMailButton({ workOrderId, email }: { workOrderId: string; email?: string | null }) {
  const send = useServerFn(sendWerkbonEmail);
  const [busy, setBusy] = useState(false);

  async function mail(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!email) {
      toast.error("Deze werkbon heeft geen e-mailadres");
      return;
    }
    setBusy(true);
    try {
      const r = await send({ data: { workOrderId } });
      if (r.sent) toast.success(`Werkbon gemaild naar ${email}`);
      else if (r.reason === "not_signed") toast.error("De werkbon is nog niet afgetekend");
      else if (r.reason === "no_email") toast.error("Deze werkbon heeft geen e-mailadres");
      else if (r.reason === "reconnect_required") toast.error("Koppel de mailbox info@riory.be opnieuw om te kunnen mailen");
      else if (r.reason === "mailbox_not_connected") toast.error("Koppel eerst de mailbox info@riory.be op de takenpagina");
      else toast.error("Mail versturen mislukt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mail versturen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={mail} disabled={busy} title={email ? `Mail naar ${email}` : "Geen e-mailadres"}>
      <Mail aria-hidden="true" />
      {busy ? "Mailen…" : "Mail werkbon"}
    </Button>
  );
}
