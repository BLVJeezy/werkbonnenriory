import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { videoPlayback } from "@/lib/videos.functions";

export const Route = createFileRoute("/video/$token")({
  head: () => ({
    meta: [
      { title: "Filmpje van je werken — Riory" },
      { name: "description", content: "Bekijk het filmpje dat Riory van de werken bij je maakte." },
      { property: "og:title", content: "Filmpje van je werken — Riory" },
      { property: "og:description", content: "Bekijk het filmpje dat Riory van de werken bij je maakte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VideoPage,
});

function VideoPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<{ loading: boolean; error?: string; title?: string; url?: string }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    videoPlayback({ data: { token } })
      .then((r) => { if (!cancelled) setState({ loading: false, title: r.title, url: r.url }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : "Filmpje kon niet geladen worden" }); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-4">
      <p className="text-xl font-black tracking-tight">RIORY <span className="text-primary">WERKBONNEN</span></p>
      {state.loading && <p className="text-muted-foreground">Filmpje laden…</p>}
      {state.error && <p className="text-destructive">{state.error}</p>}
      {state.url && (
        <>
          <h1 className="text-lg font-bold">{state.title}</h1>
          <video
            src={state.url}
            controls
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            className="max-h-[75dvh] w-full max-w-3xl rounded-md border bg-black"
            playsInline
          />
          <p className="text-xs text-muted-foreground">Dit filmpje kan enkel bekeken worden, niet gedownload.</p>
        </>
      )}
    </div>
  );
}
