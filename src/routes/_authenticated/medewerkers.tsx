import { createFileRoute } from '@tanstack/react-router';
import { useRole } from '@/lib/use-role';

export const Route = createFileRoute('/_authenticated/medewerkers')({
  head: () => ({ meta: [
    { title: 'Medewerkers — Riory Werkbonnen' },
    { name: 'description', content: 'Medewerkersbeheer en tijdklok van Riory.' },
    { property: 'og:title', content: 'Medewerkers — Riory Werkbonnen' },
    { property: 'og:description', content: 'Medewerkersbeheer en tijdklok van Riory.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: Medewerkers,
});

function Medewerkers() {
  const role = useRole();
  if (role !== 'admin') return null;
  return <iframe title="Medewerkers — Riory tijdklok" src="https://tikklokriory.lovable.app/admin" className="block h-full w-full border-0" />;
}