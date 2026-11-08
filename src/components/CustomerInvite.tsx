import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { inviteCustomer, retryAppointmentMail } from '@/lib/appointments.functions';
import { appointmentStatuses } from '@/lib/appointments';
import { SLOT_CHOICES, type SlotChoice, inviteBlock, inviteDayLabel, inviteDays, inviteSlotLabel, inviteSlots, partsForChoice } from '@/lib/invite-slots';
import { useRole } from '@/lib/use-role';

type InviteTask = { id: string; customer_name: string; email?: string | null; technician_id?: string | null; status?: string | null };

/** Knop plus keuzescherm: de beheerder kiest standaardvakken en mailt de klant een uitnodiging. */
export function CustomerInvite({ task, size = 'sm', className }: { task: InviteTask; size?: 'sm' | 'default'; className?: string }) {
  const role = useRole();
  const qc = useQueryClient();
  const invite = useServerFn(inviteCustomer);
  const resend = useServerFn(retryAppointmentMail);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<SlotChoice>('beide');
  const [busy, setBusy] = useState(false);
  const [days] = useState(() => inviteDays(new Date(), 5));
  const slots = inviteSlots(days, choice);
  const block = inviteBlock(task);

  const { data: r } = useQuery({
    queryKey: ['appointment', task.id],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase
        .from('appointment_requests')
        .select('status,proposed_date,time_from,time_until,crew_slots,customer_slots,mail_error,mail_pending,expires_at')
        .eq('work_order_id', task.id)
        .maybeSingle();
      return data;
    },
  });
  const live = r && Date.parse(r.expires_at) >= Date.now() ? r : null;

  async function send() {
    if (busy || !slots.length) return;
    setBusy(true);
    try {
      if (choice === 'eerste') {
        const { error } = await supabase.from('work_orders').update({ first_customer: true }).eq('id', task.id);
        if (error) throw new Error('Label Eerste klant kon niet bewaard worden.');
      }
      const result = await invite({ data: { id: task.id, slots } });
      qc.invalidateQueries({ queryKey: ['appointment', task.id] });
      qc.invalidateQueries({ queryKey: ['work_orders'] });
      if (result.sent) {
        toast.success(`Uitnodiging verstuurd naar ${task.customer_name}`);
        setOpen(false);
      } else toast.error(result.error ?? 'Uitnodiging bewaard, maar de mail is niet verstuurd. Probeer opnieuw.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uitnodigen mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await resend({ data: { id: task.id } });
      qc.invalidateQueries({ queryKey: ['appointment', task.id] });
      if (result.sent) toast.success('Uitnodiging opnieuw verstuurd');
      else toast.error(result.error ?? 'Mail niet verstuurd');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opnieuw sturen mislukt');
    } finally {
      setBusy(false);
    }
  }

  if (role !== 'admin') return null;
  return (
    <>
      <Button type="button" size={size} variant="outline" className={className} disabled={!!block} title={block || `Klant uitnodigen: ${task.customer_name}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        Klant uitnodigen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Klant uitnodigen: {task.customer_name}</DialogTitle>
            <DialogDescription>Kies welk deel van de dag je voorstelt. De klant krijgt een mail met een link, bevestigt zelf, en de afspraak komt in de agenda.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Deel van de dag">
            {SLOT_CHOICES.map((c) => (
              <Button key={c.key} type="button" size="sm" variant={choice === c.key ? 'default' : 'outline'} aria-pressed={choice === c.key} onClick={() => setChoice(c.key)}>
                {c.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            {days.map((d) => (
              <div key={d} className="flex flex-wrap items-baseline gap-x-3 border-b py-1.5 last:border-b-0">
                <span className="w-20 font-bold">{inviteDayLabel(d)}</span>
                <span className="text-sm">{partsForChoice(choice).map((p) => `${p.label} ${p.from}–${p.until}`).join('  ·  ')}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Voorgesteld: {slots.map(inviteSlotLabel).join(' · ')}</p>
          <DialogFooter>
            <Button disabled={busy || !slots.length} onClick={send}>
              {busy ? 'Versturen…' : 'Uitnodiging versturen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {live && (
        <span className="inline-flex flex-wrap items-center gap-2 text-xs font-bold">
          {appointmentStatuses[live.status] ?? live.status}
          {live.mail_error && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void again(); }}>
              Mail opnieuw sturen
            </Button>
          )}
        </span>
      )}
    </>
  );
}
