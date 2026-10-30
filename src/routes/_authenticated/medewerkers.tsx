import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRole } from '@/lib/use-role';
import clockIcon from '@/assets/riory-tijdklok-icoon-256.png.asset.json';

const TIJKLOK_URL = 'https://tikklokriory.lovable.app/admin';

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
  const [loaded, setLoaded] = useState(false);

  // A cross-origin frame always reports load, but never leave the splash up forever.
  useEffect(() => {
    if (loaded) return;
    const t = setTimeout(() => setLoaded(true), 8000);
    return () => clearTimeout(t);
  }, [loaded]);

  if (role !== 'admin') return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-print flex shrink-0 items-center gap-3 border-b border-primary/30 bg-secondary px-3 py-2 text-secondary-foreground">
        <img src={clockIcon.url} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black uppercase">Medewerkers</p>
          <p className="truncate text-xs opacity-80">Riory tijdklok — eigen login nodig</p>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
          <a href={TIJKLOK_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            <span className="hidden sm:inline">Openen in nieuw tabblad</span>
            <span className="sm:hidden">Openen</span>
          </a>
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background">
            <img src={clockIcon.url} alt="" width={96} height={96} className="h-24 w-24 animate-pulse rounded-xl" />
            <p className="text-sm font-semibold text-muted-foreground">Riory tijdklok laden…</p>
          </div>
        )}
        <iframe
          title="Medewerkers — Riory tijdklok"
          src={TIJKLOK_URL}
          onLoad={() => setLoaded(true)}
          className="block h-full w-full border-0"
        />
      </div>
    </div>
  );
}
