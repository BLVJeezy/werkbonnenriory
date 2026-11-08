import { createFileRoute } from '@tanstack/react-router';
import { TikklokAdmin } from '@/components/tikklok/admin-screen';
import { useRole } from '@/lib/use-role';

export const Route = createFileRoute('/_authenticated/tikklok-beheer')({
  head: () => ({ meta: [
    { title: 'Tikklokbeheer — Riory Werkbonnen' },
    { name: 'description', content: 'Afgeschermd beheer van medewerkers, uren en personeelsdossiers bij Riory.' },
    { property: 'og:title', content: 'Tikklokbeheer — Riory Werkbonnen' },
    { property: 'og:description', content: 'Afgeschermd beheer van medewerkers, uren en personeelsdossiers bij Riory.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: TikklokBeheer,
});

function TikklokBeheer() {
  const role = useRole();
  if (role !== 'admin') return null;
  return <TikklokAdmin />;
}