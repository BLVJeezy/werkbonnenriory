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
const exchangeInput = z.object({ token: z.string().regex(/^[a-zA-Z0-9_-]{32,512}$/) });
const documentInput = z.object({
  type: z.enum(["factuur", "werkbon"]),
  // Real documents use UUIDs; "demo-…" ids are the in-memory examples for the test account.
  id: z.union([z.string().uuid(), z.string().regex(/^demo-[a-z-]{2,30}$/)]),
});
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
  service: z.string().max(40).optional(),
});
const optText = (max: number) => z.string().trim().max(max).optional();
const profileInput = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(2, "Vul uw naam in.").max(120),
  phone: optText(40),
  street: optText(120),
  house_number: optText(20),
  postal_code: optText(20),
  city: optText(80),
  billing_email: z
    .union([z.literal(""), z.string().trim().email("Ongeldig factuur-e-mailadres.").max(254)])
    .optional(),
});
const invoiceRequestInput = z.object({
  message: z.string().trim().min(3, "Zeg welke factuur u zoekt.").max(1000),
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

        if (params.action === "exchange") {
          const parsed = exchangeInput.safeParse(body);
          if (!parsed.success) return reply({ error: "Ongeldige inloglink." }, 400);
          try {
            const result = await portal.exchangePortalLoginToken(supabaseAdmin, parsed.data.token);
            if (!result) return reply({ error: "Deze inloglink is verlopen of al gebruikt." }, 401);
            return reply(result);
          } catch (e) {
            return reply({ error: e instanceof Error ? e.message : "Inloggen mislukt." }, 403);
          }
        }

        // Data actions only accept a portal token, never a Supabase session.
        const token = request.headers
          .get("Authorization")
          ?.match(/^Bearer (rp1\.\S{20,4096})$/)?.[1];
        if (!token) return reply({ error: "Niet ingelogd." }, 401);
        const claims = await portal.verifyPortalRequestToken(token);
        if (!claims) return reply({ error: "Sessie verlopen. Log opnieuw in." }, 401);
        const userId = claims.uid;
        const email = claims.email;

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
          if (params.action === "profile") {
            const parsed = profileInput.safeParse(body);
            if (!parsed.success) {
              return reply(
                { error: parsed.error.issues[0]?.message ?? "Ongeldige gegevens." },
                400,
              );
            }
            return reply(
              await portal.updatePortalProfile(supabaseAdmin, userId, email, parsed.data),
            );
          }
          if (params.action === "invoice-request") {
            const parsed = invoiceRequestInput.safeParse(body);
            if (!parsed.success) {
              return reply(
                { error: parsed.error.issues[0]?.message ?? "Ongeldige aanvraag." },
                400,
              );
            }
            return reply(
              await portal.requestPortalInvoiceCopy(
                supabaseAdmin,
                userId,
                email,
                parsed.data.message,
              ),
            );
          }
          return reply({ error: "Onbekende actie." }, 404);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Er ging iets mis.";
          const status = /Voorbeeldweergave/.test(message)
            ? 409
            : /toegang|medewerkersaccount/i.test(message)
              ? 403
              : 400;
          return reply({ error: message }, status);
        }
      },
    },
  },
});
