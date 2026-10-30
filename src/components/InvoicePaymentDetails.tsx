import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buildSepaQr, openAmount, paymentText, type SepaQrInput } from "@/lib/sepa-qr";
import { euro } from "@/lib/billing";
import { invoicePaymentReference } from '@/lib/invoice-payment-reference';

type Invoice = { number: string; total: number; paid_amount: number; due_date: string };
type Company = { name: string; iban: string | null; bic: string | null };

/**
 * Free payment route: a SEPA payment code the customer scans with their own banking app.
 * No card network and no payment provider involved, so nothing costs per payment.
 */
export function InvoicePaymentDetails({ invoice, company }: { invoice: Invoice; company: Company }) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const due = openAmount(Number(invoice.total), Number(invoice.paid_amount));
  const input: SepaQrInput = {
    serviceName: company.name,
    iban: company.iban ?? "",
    bic: company.bic,
    amount: due,
    reference: invoice.number,
  };
  const usable = !!company.iban && due > 0.005;

  useEffect(() => {
    if (!usable) return;
    let alive = true;
    (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const url = await QRCode.toDataURL(buildSepaQr(input), { margin: 1, width: 360 });
        if (alive) { setQr(url); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Betaalcode kon niet gemaakt worden");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable, invoice.number, due, company.iban, company.bic, company.name]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(paymentText(input));
      toast.success("Betaalgegevens gekopieerd");
    } catch {
      toast.error("Kopiëren lukte niet; selecteer de tekst hieronder en kopieer handmatig");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!usable} title={usable ? "Betaalcode tonen" : "IBAN nog niet ingevuld bij Factuurinstellingen"}>
          <QrCode className="h-4 w-4" />Betaalcode
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase">Betaalgegevens factuur {invoice.number}</DialogTitle>
          <DialogDescription>
            De klant scant deze code met zijn eigen bankapp; de overboeking is dan vooraf ingevuld.
            Dit kost niets per betaling, want er is geen kaartnetwerk bij.
          </DialogDescription>
        </DialogHeader>
        {!usable ? (
          <p className="text-sm text-destructive">
            {company.iban ? "Deze factuur is al volledig betaald." : "Vul eerst je IBAN in bij Factuurinstellingen."}
          </p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : qr ? (
              <img src={qr} alt={`Betaalcode voor factuur ${invoice.number}`} className="mx-auto h-56 w-56 rounded border bg-white p-2" />
            ) : (
              <p className="text-center text-sm text-muted-foreground">Code wordt gemaakt…</p>
            )}
            <dl className="space-y-1 text-sm">
              <Row label="Bedrag" value={euro(due)} />
              <Row label="Ontvanger" value={company.name} />
              <Row label="IBAN" value={input.iban.toUpperCase().replace(/(.{4})/g, "$1 ").trim()} mono />
              {company.bic ? <Row label="BIC" value={company.bic.toUpperCase()} mono /> : null}
              <Row label="Mededeling" value={invoicePaymentReference(invoice.number)} mono />
              <Row label="Vervaldag" value={new Date(`${invoice.due_date}T00:00`).toLocaleDateString("nl-BE")} />
            </dl>
            <Button size="sm" onClick={copy}>Betaalgegevens kopiëren</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono font-bold" : "font-bold"}>{value}</dd>
    </div>
  );
}
