import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { documentReport } from '@/lib/document-reports.functions';
export function DocumentReport({ id, type }: { id: string; type: 'factuur' | 'creditnota' | 'offerte' | 'werkbon' }) {
  const [open,setOpen] = useState(false);
  const report = useServerFn(documentReport);
  const { data, error, isLoading } = useQuery({ queryKey: ['document-report',type,id], queryFn: () => report({ data: { id,type } }), enabled: open, refetchInterval: open ? 10000 : false });
  const date = (v: string) => new Date(v).toLocaleString('nl-BE');
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Eye className="h-4 w-4" />Verslag</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Documentverslag</DialogTitle><DialogDescription>Openingen van de mail (afbeeldingen geladen) en van de documentlink. Sommige mailprogramma’s blokkeren afbeeldingen; geen bewijs van lezen.</DialogDescription></DialogHeader>
      {isLoading && <p>Laden…</p>}{error && <p className="text-destructive">Verslag ophalen mislukt.</p>}
      {data?.length === 0 && <p className="text-muted-foreground">Nog geen verzending met documentlink geregistreerd. Eerder verzonden bijlagen hebben geen openingshistoriek.</p>}
      <ul className="divide-y">{data?.map(row => <li key={row.id} className="space-y-2 py-3"><h3 className="font-bold">{row.label}</h3><p className="break-all text-sm">{row.recipient}</p><p className="text-sm">{row.status === 'accepted' ? `Mail aanvaard door Outlook · ${date(row.sent_at ?? row.created_at)}` : row.status === 'uncertain' ? 'Verzending onzeker — controleer Outlook' : 'Verzending voorbereid, nog niet bevestigd'}</p><p className="font-semibold">{row.document_open_events.length} keer geopend</p><ul className="text-sm text-muted-foreground">{[...row.document_open_events].sort((a,b) => b.opened_at.localeCompare(a.opened_at)).map((event,n) => <li key={n}>{date(event.opened_at)} · {(event as { source?: string }).source === "mail" ? "mail geopend" : "documentlink"}</li>)}</ul></li>)}</ul>
    </DialogContent></Dialog>;
}