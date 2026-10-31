import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { addDays } from "@/lib/invoice";
import { brusselsDate } from "@/lib/payment-reminders";

type Row = { id: string; number: string; balance: number; name: string };
const KEY = "riory-notice-alert-seen";

/** Warns the admin about invoices still unpaid 15+ days after the formal notice (stage 3). */
export function OverdueAfterNoticeAlert() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: rem } = await supabase.from("invoice_reminders").select("invoice_id,sent_at").eq("stage", 3).eq("status", "accepted");
      const today = brusselsDate();
      const ids = (rem ?? []).filter(r => r.sent_at && addDays(brusselsDate(new Date(r.sent_at)), 15) <= today).map(r => r.invoice_id);
      if (!ids.length) return;
      const { data: inv } = await supabase.from("invoices").select("id,number,total,paid_amount,customer").in("id", ids);
      const open = (inv ?? []).map(i => ({ id: i.id, number: i.number, balance: Number(i.total) - Number(i.paid_amount), name: (i.customer as any)?.name ?? "" })).filter(i => i.balance > 0.005);
      if (!open.length) return;
      setRows(open);
      if (sessionStorage.getItem(KEY) !== today) setOpen(true);
    })();
  }, []);
  if (!rows.length) return null;
  const close = () => { sessionStorage.setItem(KEY, brusselsDate()); setOpen(false); };
  return (
    <AlertDialog open={open} onOpenChange={o => !o && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Onbetaald na ingebrekestelling</AlertDialogTitle>
          <AlertDialogDescription>Deze facturen zijn nog altijd niet betaald, ook niet na de ingebrekestelling. Beslis over verdere stappen (bv. incassobureau of gerechtsdeurwaarder).</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 space-y-1 overflow-auto text-sm">
          {rows.map(r => <li key={r.id} className="flex justify-between gap-2"><span>{r.number} · {r.name}</span><span className="font-mono">€ {r.balance.toFixed(2).replace('.', ',')}</span></li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogAction asChild onClick={close}><Link to="/facturen">Naar facturen</Link></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
