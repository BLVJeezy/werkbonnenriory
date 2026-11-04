import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SINCE_KEY = "riory-notif-since";
const OVERDUE_KEY = "riory-notif-overdue";
const POLL_MS = 30_000;
const show = (title: string, description?: string) => toast(title, { description, duration: 15_000 });

/** Meldingen voor de beheerder: offerte akkoord, factuur betaald/vervallen, werkbon afgewerkt, herinnering verstuurd. */
export function AdminNotifications() {
  useEffect(() => {
    let stop = false;
    async function poll() {
      const now = new Date().toISOString();
      const since = localStorage.getItem(SINCE_KEY) ?? now;
      const [q, p, w, r, o] = await Promise.all([
        supabase.from("quotes").select("number, customer").eq("status", "akkoord").gt("signed_at", since).limit(20),
        supabase.from("invoices").select("number, customer, paid_amount").not("paid_at", "is", null).gt("paid_at", since).limit(20),
        supabase.from("work_orders").select("number, customer_name, technicians!work_orders_technician_id_fkey(name)").gt("signed_at", since).limit(20),
        supabase.from("invoice_reminders").select("stage, recipient, invoices(number)").not("sent_at", "is", null).gt("sent_at", since).limit(20),
        supabase.from("invoices").select("id, number, customer, due_date").is("paid_at", null).not("sent_at", "is", null).eq("kind", "factuur").lt("due_date", now.slice(0, 10)).limit(500),
      ]);
      if (stop) return;
      const name = (c: unknown) => (c as { name?: string } | null)?.name ?? "";
      for (const x of q.data ?? []) show(`Offerte ${x.number} akkoord`, name(x.customer));
      for (const x of p.data ?? []) show(`Factuur ${x.number} betaald`, `${name(x.customer)} · € ${Number(x.paid_amount).toFixed(2)}`);
      for (const x of (w.data ?? []) as { number: number | null; customer_name: string; technicians: { name: string } | null }[]) show(`Werkbon ${x.number ?? ""} afgewerkt`, `${x.customer_name}${x.technicians ? ` · ${x.technicians.name}` : ""}`);
      for (const x of (r.data ?? []) as { stage: number; recipient: string; invoices: { number: string } | null }[]) show(`Herinnering ${x.stage} verstuurd`, `Factuur ${x.invoices?.number ?? ""} · ${x.recipient}`);
      if (!o.error) {
        const seen = new Set<string>(JSON.parse(localStorage.getItem(OVERDUE_KEY) ?? "[]"));
        const fresh = (o.data ?? []).filter((x) => !seen.has(x.id));
        if (fresh.length > 3) show(`${fresh.length} facturen vervallen`, "Bekijk de facturenlijst (rood).");
        else for (const x of fresh) show(`Factuur ${x.number} vervallen`, `${name(x.customer)} · vervaldag ${new Date(x.due_date).toLocaleDateString("nl-BE")}`);
        localStorage.setItem(OVERDUE_KEY, JSON.stringify((o.data ?? []).map((x) => x.id)));
      }
      localStorage.setItem(SINCE_KEY, now);
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return null;
}
