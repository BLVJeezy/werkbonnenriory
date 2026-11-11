import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { interventionDay, located, type InterventionLocation } from '@/lib/intervention-map';
import { saveInterventionCoordinates, geocodeInterventionBatch } from '@/lib/intervention-map.functions';

export function InterventionLocationDetails({ location, configured, onClose }: { location: InterventionLocation | null; configured: boolean; onClose: () => void }) {
  const save = useServerFn(saveInterventionCoordinates); const geocode = useServerFn(geocodeInterventionBatch); const qc = useQueryClient();
  const [lat, setLat] = useState(''); const [lon, setLon] = useState(''); const [busy, setBusy] = useState(false);
  const canLocate = !!location && !location.key.startsWith('missing:');
  return <Dialog open={!!location} onOpenChange={open => { if (!open) { onClose(); setLat(''); setLon(''); } }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle className="break-words">{location?.address}</DialogTitle></DialogHeader>
    {location && <>
      <p className="text-sm text-muted-foreground">{location.customers.join(' · ')} · {location.orders.length} interventies</p>
      <div className="divide-y">{location.orders.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><p className="font-semibold">{interventionDay(order)} · {order.activities?.name ?? 'Interventie'}</p><p className="text-sm text-muted-foreground">{order.customer_name} · {order.technicians?.name ?? 'Geen ploeg'}</p></div>
        <Button variant="outline" size="sm" asChild><Link to="/werkbonnen/$id" params={{ id: order.id }}>Werkbon {order.number ?? 'Nieuw'}</Link></Button>
      </div>)}</div>
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-bold">Locatie</h3>
        {located(location.cache) ? <p className="font-mono text-sm">{location.cache.lat}, {location.cache.lon} · {location.cache.source === 'manual' ? 'Handmatig bevestigd' : 'Adreszoekdienst'}</p> : <p className="text-sm text-muted-foreground">{location.cache?.error ?? 'Nog geen coördinaten opgeslagen.'}</p>}
        {canLocate && <form className="space-y-3" onSubmit={async event => {
          event.preventDefault(); const latitude = Number(lat.replace(',', '.')); const longitude = Number(lon.replace(',', '.'));
          if (!lat.trim() || !lon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { toast.error('Vul geldige breedte- en lengtegraad in.'); return; }
          setBusy(true); try { await save({ data: { id: location.orders[0].id, lat: latitude, lon: longitude } }); await qc.invalidateQueries({ queryKey: ['intervention-map'] }); toast.success('Locatie opgeslagen.'); onClose(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Opslaan mislukt.'); } finally { setBusy(false); }
        }}>
          <div className="grid grid-cols-2 gap-2"><label className="text-sm">Breedtegraad<Input aria-label="Breedtegraad" value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" required /></label><label className="text-sm">Lengtegraad<Input aria-label="Lengtegraad" value={lon} onChange={e => setLon(e.target.value)} inputMode="decimal" required /></label></div>
          <Button disabled={busy} type="submit">{busy ? 'Bezig…' : 'Coördinaten opslaan'}</Button>
          {configured && !located(location.cache) && <Button type="button" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const result = await geocode({ data: { ids: [location.orders[0].id] } }); toast.info(result.found ? 'Locatie gevonden.' : result.stopped === 'budget' ? 'Dagbudget bereikt.' : 'Nog geen exacte locatie gevonden.'); await qc.invalidateQueries({ queryKey: ['intervention-map'] }); onClose(); } catch(error) { toast.error(error instanceof Error ? error.message : 'Opzoeken mislukt.'); } finally { setBusy(false); } }}>Adres opnieuw opzoeken</Button>}
        </form>}
      </div>
    </>}
  </DialogContent></Dialog>;
}