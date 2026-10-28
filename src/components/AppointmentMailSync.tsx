import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { processAppointmentMails } from "@/lib/appointment-mail.functions";
import { Button } from "@/components/ui/button";

export function AppointmentMailSync() {
  const process = useServerFn(processAppointmentMails);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["appointment-mail-moves"], queryFn: () => process(), refetchInterval: 15000, retry: false });
  if (!data?.error && !data?.pending) return null;
  return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    <span>{data.error ?? `${data.pending} afspraakmails wachten op verplaatsing naar Uitgevoerd.`}</span>
    <Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>Opnieuw proberen</Button>
  </div>;
}