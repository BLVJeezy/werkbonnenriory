import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { processAppointmentMails } from "@/lib/appointment-mail.functions";
import { Button } from "@/components/ui/button";
import { MailboxConnect } from "@/components/MailboxConnect";

export function AppointmentMailSync() {
  const process = useServerFn(processAppointmentMails);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["appointment-mail-moves"], queryFn: () => process(), refetchInterval: 15000, retry: false });
  if (!data?.error && !data?.pending) return null;
  const needsConnect = Boolean(data.error?.startsWith("Koppel"));
  return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    <span>{data.error ?? `${data.pending} afspraakmails wachten op verplaatsing naar Uitgevoerd.`}</span>
    {needsConnect ? <MailboxConnect /> : <Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>Verplaatsing opnieuw proberen</Button>}
  </div>;
}