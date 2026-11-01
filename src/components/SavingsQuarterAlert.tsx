import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SAVINGS_ACCOUNT, markSavingsQuarterDone, previousQuarter, savingsQuarterDone } from "@/lib/savings-quarter";

const SEEN = "riory-savings-alert-seen";

/** Elk kwartaal: vraag het uittreksel van de spaarrekening in te laden zolang het vorige kwartaal ontbreekt. */
export function SavingsQuarterAlert() {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const q = previousQuarter(today);
  useEffect(() => {
    (async () => {
      if (savingsQuarterDone(today)) return;
      try { if (sessionStorage.getItem(SEEN) === today) return; } catch { /* */ }
      const { count } = await supabase.from("fin_bank_tx").select("id", { count: "exact", head: true }).eq("bank_account", SAVINGS_ACCOUNT).gte("tx_date", q.start).lte("tx_date", q.end);
      if (count) { markSavingsQuarterDone(today); return; }
      setOpen(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const later = () => { try { sessionStorage.setItem(SEEN, today); } catch { /* */ } setOpen(false); };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && later()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Spaarrekening inladen</AlertDialogTitle>
          <AlertDialogDescription>Het uittreksel van de spaarrekening ({SAVINGS_ACCOUNT}) voor {q.label.replace("-", " ")} ({q.start} t/m {q.end}) is nog niet ingeladen.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={later}>Later</AlertDialogCancel>
          <AlertDialogCancel onClick={() => { markSavingsQuarterDone(today); setOpen(false); }}>Geen verrichtingen</AlertDialogCancel>
          <AlertDialogAction asChild onClick={later}><Link to="/boekhouding" search={{ tab: "bank" }}>Nu inladen</Link></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
