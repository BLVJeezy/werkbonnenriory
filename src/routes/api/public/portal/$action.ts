import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Portal API for www.riory.be/klantportaal. The portal UI lives on the official website;
 * this app only serves the data. Browser calls are limited to riory.be origins and every
 * data action requires the customer's own Supabase session token.
 */

const loginInput = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .refine((v) => !v.includes("*")),
});
const documentInput = z.object({ type: z.enum(["factuur", "werkbon"]), id: z.string().uuid() });
const appointmentInput = z.object({
  description: z
    .string()
    .trim()
    .min(5, "Omschrijf kort het probleem of de gewenste werken.")
    .max(2000),
  preferredWindow: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  urgent: z.boolean().optional(),
  worksiteDifferent: z.boolean().optional(),
  worksiteStreet: z.string().trim().max(120).optional(),
  worksiteHouseNumber: z.string().trim().max(20).optional(),
  worksitePostalCode: z.string().trim().max(20).optional(),
  worksiteCity: z.string().trim().max(80).optional(),
  projectName: z.string().trim().max(120).optional(),
  customerId: z.string().uuid().optional(),
});

async function corsHeaders(request: Request): Promise<Record<string, string>> {
  const { portalOriginAllowed } = await import("@/lib/customer-portal");
  const origin = request.headers.get("Origin");
  const base: Record<string, string> = {
    "Cache-Control": "private, no-store",
    Vary: "Origin, Authorization",
  };
  if (!portalOriginAllowed(origin)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Access-Control-Max-Age": "600",
  };
}

export const Route = createFileRoute("/api/public/portal/$action")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: await corsHeaders(request) }),
      POST: async ({ request, params }) => {
        const headers = await corsHeaders(request);
        const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
        if (!headers["Access-Control-Allow-Origin"]) return reply({ error: "Geen toegang." }, 403);

        let body: unknown;
        try {
          const raw = await request.text();
          if (raw.length > 8192) return reply({ error: "Aanvraag te groot." }, 413);
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return reply({ error: "Ongeldige aanvraag." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const portal = await import("@/lib/customer-portal.server");

        if (params.action === "login") {
          const parsed = loginInput.safeParse(body);
          if (!parsed.success) return reply({ error: "Vul een geldig e-mailadres in." }, 400);
          const started = Date.now();
          try {
            await portal.requestPortalLoginLink(supabaseAdmin, parsed.data.email);
          } catch (e) {
            console.error("portal login request", e instanceof Error ? e.message : e);
          }
          // Equal response time for known and unknown addresses, so timing reveals nothing.
          const wait = 1500 - (Date.now() - started);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          return reply({ ok: true });
        }

        const token = request.headers.get("Authorization")?.match(/^Bearer (\S{20,4096})$/)?.[1];
        if (!token) return reply({ error: "Niet ingelogd." }, 401);
        const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !auth?.user)
          return reply({ error: "Sessie verlopen. Log opnieuw in." }, 401);
        const userId = auth.user.id;
        const email = auth.user.email ?? null;

        try {
          if (params.action === "overview") {
            return reply(await portal.buildPortalOverview(supabaseAdmin, userId, email));
          }
          if (params.action === "document") {
            const parsed = documentInput.safeParse(body);
            if (!parsed.success) return reply({ error: "Ongeldige aanvraag." }, 400);
            const { pdf, filename } = await portal.buildPortalDocument(
              supabaseAdmin,
              userId,
              email,
              parsed.data,
            );
            return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
              headers: {
                ...headers,
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
              },
            });
          }
          if (params.action === "appointment") {
            const parsed = appointmentInput.safeParse(body);
            if (!parsed.success) {
              return reply(
                { error: parsed.error.issues[0]?.message ?? "Ongeldige aanvraag." },
                400,
              );
            }
            return reply(
              await portal.createPortalAppointment(supabaseAdmin, userId, email, parsed.data),
            );
          }
          return reply({ error: "Onbekende actie." }, 404);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Er ging iets mis.";
          return reply({ error: message }, /toegang|medewerkersaccount/i.test(message) ? 403 : 400);
        }
      },
    },
  },
});
