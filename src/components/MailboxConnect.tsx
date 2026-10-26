import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeOutlookConnect, disconnectOutlook, outlookStatus, startOutlookConnect } from "@/lib/outlook.functions";
import {
  completeWerkbonMailboxConnect,
  disconnectWerkbonMailbox,
  startWerkbonMailboxConnect,
  WERKBON_MAILBOX_ADDRESS,
  werkbonMailboxStatus,
} from "@/lib/werkbon-mailbox.functions";
import { MAILBOX_ADDRESS } from "@/lib/mailbox.functions";

function waitForCode(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      window.clearInterval(poll);
    };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "microsoft_outlook") return;
      if (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed") return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data.code === "string" ? e.data.code : null);
      else reject(new Error("Aanmelden bij Microsoft is mislukt."));
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Aanmeldvenster gesloten voor het klaar was."));
    }, 500);
  });
}

type MailboxFns = {
  status: any;
  start: any;
  complete: any;
  disconnect: any;
};

/** Admin signs in once with the mailbox account itself. */
function MailboxConnectCard({ mailbox, queryKey, fns }: { mailbox: string; queryKey: string; fns: MailboxFns }) {
  const qc = useQueryClient();
  const status = useServerFn(fns.status);
  const start = useServerFn(fns.start);
  const complete = useServerFn(fns.complete);
  const disconnect = useServerFn(fns.disconnect);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: [queryKey], queryFn: () => status() });

  async function connect() {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) { toast.error("Pop-up geblokkeerd. Sta pop-ups toe en probeer opnieuw."); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start();
      const wait = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await wait;
      if (code) await complete({ data: { code } });
      await qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success("Mailbox gekoppeld");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt");
    } finally {
      setBusy(false);
    }
  }

  const wrong = data?.mailbox && data.mailbox.toLowerCase() !== mailbox;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {data?.connected ? (
        <>
          <span className={wrong ? "font-bold text-destructive" : "text-muted-foreground"}>
            Gekoppeld: {data.mailbox ?? "mailbox"}
            {wrong && ` (verwacht ${mailbox})`}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={connect}>Opnieuw koppelen</Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Mailbox ontkoppelen?")) return;
              await disconnect();
              qc.invalidateQueries({ queryKey: [queryKey] });
            }}
          >
            Ontkoppelen
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={busy || !data} onClick={connect}>
          {data && "reconnectRequired" in data && data.reconnectRequired ? "Mailbox opnieuw koppelen" : `Mailbox koppelen (${mailbox})`}
        </Button>
      )}
    </div>
  );
}

/** afspraak@riory.be — inbox waar klantmails uit geïmporteerd worden. */
export function MailboxConnect() {
  return (
    <MailboxConnectCard
      mailbox={MAILBOX_ADDRESS}
      queryKey="outlook_status"
      fns={{ status: outlookStatus, start: startOutlookConnect, complete: completeOutlookConnect, disconnect: disconnectOutlook }}
    />
  );
}

/** info@riory.be — afzender van de werkbonmail naar de klant. */
export function WerkbonMailboxConnect() {
  return (
    <MailboxConnectCard
      mailbox={WERKBON_MAILBOX_ADDRESS}
      queryKey="werkbon_mailbox_status"
      fns={{ status: werkbonMailboxStatus, start: startWerkbonMailboxConnect, complete: completeWerkbonMailboxConnect, disconnect: disconnectWerkbonMailbox }}
    />
  );
}
