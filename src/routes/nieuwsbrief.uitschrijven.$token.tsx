import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { unsubscribeNewsletter } from '@/lib/newsletters.functions';
import logo from '@/assets/riory-mail-logo.png.asset.json';

export const Route = createFileRoute('/nieuwsbrief/uitschrijven/$token')({
  head: () => ({ meta: [{ title: 'Uitschrijven nieuwsbrief — Riory' }, { name: 'description', content: 'Uw Riory-nieuwsbrieftoestemming intrekken.' }, { property: 'og:title', content: 'Uitschrijven nieuwsbrief — Riory' }, { property: 'og:description', content: 'Stop de ontvangst van Riory-nieuwsbrieven.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: Unsubscribe,
});
function Unsubscribe() {
  const { token } = Route.useParams();
  const unsubscribe = useServerFn(unsubscribeNewsletter);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle'), [error, setError] = useState('');
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-12"><img src={logo.url} width={240} height={49} alt="Riory" className="h-auto max-w-full" /><h1 className="text-2xl font-bold">{state === 'done' ? 'U bent uitgeschreven' : 'Uitschrijven voor nieuwsbrieven'}</h1><p>{state === 'done' ? 'U ontvangt geen Riory-nieuwsbrieven meer. Mails over uw afspraken en documenten blijven behouden.' : 'Wilt u geen Riory-nieuwsbrieven meer ontvangen?'}</p>{error && <p role="alert" className="text-destructive">{error}</p>}{state !== 'done' && <Button disabled={state === 'busy'} onClick={async () => { setState('busy'); setError(''); try { const result = await unsubscribe({ data: { token } }); if (!result.ok) throw new Error('Deze uitschrijflink is ongeldig. Neem contact op via info@riory.be.'); setState('done'); } catch (e) { setError(e instanceof Error ? e.message : 'Uitschrijven mislukt.'); setState('idle'); } }}>{state === 'busy' ? 'Bezig…' : 'Uitschrijven'}</Button>}</main>;
}