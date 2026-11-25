import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { PORTAL_PUBLIC_URL } from "@/lib/customer-portal";
import { portalGoogleHandoff } from "@/lib/customer-portal.functions";

/**
 * Google sign-in for the customer portal on www.riory.be/klantportaal.
 * This page has no portal UI: it signs in with Google, swaps the session for a one-time
 * portal login link, signs out here again and sends the customer back to riory.be.
 */
export const Route = createFileRoute("/klantportaal-google")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inloggen met Google — Riory" },
      { name: "description", content: "U wordt doorgestuurd naar het Riory-klantenportaal." },
      { property: "og:title", content: "Inloggen met Google — Riory" },
      {
        property: "og:description",
        content: "U wordt doorgestuurd naar het Riory-klantenportaal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GoogleHandoff,
});

const back = (reason: string) => window.location.replace(`${PORTAL_PUBLIC_URL}?fout=${reason}`);

function GoogleHandoff() {
  const handoff = useServerFn(portalGoogleHandoff);
  const [text, setText] = useState("Even geduld…");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (hash.get("error") || params.get("error")) return back("google");

      // Tokens returned by the sign-in broker in the URL hash.
      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      if (access && refresh) {
        window.history.replaceState(null, "", window.location.pathname);
        const { error } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        if (error) return back("google");
      }

      let { data } = await supabase.auth.getSession();
      if (!data.session && params.get("start") === "1") {
        setText("U wordt doorgestuurd naar Google…");
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: `${window.location.origin}/klantportaal-google`,
        });
        if (result.redirected) return;
        if (result.error) return back("google");
        data = (await supabase.auth.getSession()).data;
      }
      if (!data.session) return back("google");

      setText("U wordt ingelogd…");
      try {
        const { url } = await handoff();
        await supabase.auth.signOut();
        if (!url) return back("geen-klant");
        window.location.replace(url);
      } catch {
        await supabase.auth.signOut();
        back("google");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f6f5f2] text-sm text-muted-foreground">
      {text}
    </main>
  );
}
