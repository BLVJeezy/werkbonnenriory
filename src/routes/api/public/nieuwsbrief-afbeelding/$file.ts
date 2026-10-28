import { createFileRoute } from "@tanstack/react-router";

// Serves newsletter images publicly so mail clients can load them; only random UUID .png names.
export const Route = createFileRoute("/api/public/nieuwsbrief-afbeelding/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f-]{36}\.png$/.test(params.file)) return new Response("Niet gevonden", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("newsletter-images").download(params.file);
        if (error || !data) return new Response("Niet gevonden", { status: 404 });
        return new Response(data, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
      },
    },
  },
});
