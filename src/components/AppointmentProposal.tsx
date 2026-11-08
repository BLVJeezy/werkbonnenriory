import { appointmentSlots, appointmentStatuses, slotLabel } from '@/lib/appointments';

export type AppointmentProposalData = {
  status: string;
  expires_at: string;
  crew_slots: unknown;
  customer_slots: unknown;
  proposed_date: string | null;
  time_from: string | null;
  time_until: string | null;
};

export function AppointmentProposal({ request, external = false }: { request: AppointmentProposalData; external?: boolean }) {
  const slots = appointmentSlots(request.crew_slots);
  const alternatives = appointmentSlots(request.customer_slots);
  const selected = request.proposed_date && request.time_from && request.time_until
    ? { date: request.proposed_date, from: request.time_from.slice(0, 5), until: request.time_until.slice(0, 5) }
    : null;
  const expired = request.status !== 'confirmed' && Date.parse(request.expires_at) < Date.now();
  return <div className="space-y-2 border-t pt-2 text-sm">
    <p className="font-bold">{external ? 'Tijdsloten onderaannemer' : 'Voorgestelde tijdsloten'}</p>
    <p className="text-xs">{expired ? 'Voorstel vervallen' : appointmentStatuses[request.status] ?? request.status}</p>
    {slots.length ? <ul className="space-y-1">{slots.map((slot, index) => {
      const confirmed = request.status === 'confirmed' && selected?.date === slot.date && selected.from === slot.from && selected.until === slot.until;
      return <li key={index} className="break-words">{slotLabel(slot)}{confirmed && <strong className="ml-1 text-primary">· Bevestigd door klant</strong>}</li>;
    })}</ul> : selected ? <p>{slotLabel(selected)}{request.status === 'confirmed' && <strong className="ml-1 text-primary">· Bevestigd door klant</strong>}</p> : <p className="text-xs">Nog geen tijdsloten voorgesteld.</p>}
    {!!alternatives.length && <><p className="font-bold">Alternatieven van de klant</p><ul className="space-y-1">{alternatives.map((slot, index) => <li key={index} className="break-words">{slotLabel(slot)}</li>)}</ul></>}
  </div>;
}