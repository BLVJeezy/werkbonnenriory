// Jaarrekeningen van concurrenten: automatisch uit de openbare NBB Balanscentrale, of uit een opgeladen PDF via Lovable AI.
import { assertFinanceAdmin } from "@/lib/finance-admin";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeEnterpriseNumber, parseNbbCsv, pickLatestPerYear, type CompetitorMetrics } from "./nbb";

const NBB = "https://consult.cbso.nbb.be";

type Deposit = { id: string; periodEndDateYear: number; depositDate: string; reference: string; importFileType: string; enterpriseName: string };

export const fetchNbbAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { competitorId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context);
    const sb = context.supabase as any;
    const { data: comp } = await sb.from("fin_competitors").select("id, name, enterprise_number").eq("id", data.competitorId).maybeSingle();
    if (!comp) throw new Error("Concurrent niet gevonden");
    const nr = normalizeEnterpriseNumber(comp.enterprise_number);
    if (!nr) return { imported: 0, years: [] as number[], error: "Vul eerst een geldig ondernemingsnummer in." };

    const res = await fetch(`${NBB}/api/rs-consult/published-deposits?page=0&size=30&enterpriseNumber=${nr}&sort=periodEndDate,desc`, { headers: { Accept: "application/json" } });
    if (!res.ok) return { imported: 0, years: [], error: "Nationale Bank tijdelijk niet bereikbaar." };
    const all = ((await res.json())?.content ?? []) as Deposit[];
    // Enkel gestructureerde neerleggingen (geen losse PDF) hebben cijfers per rubriek.
    const deps = pickLatestPerYear(all.filter((d) => d.importFileType !== "PDF")).slice(0, 5);
    const years: number[] = [];
    for (const d of deps) {
      const csv = await fetch(`${NBB}/api/external/broker/public/deposits/consult/csv/${d.id}`);
      if (!csv.ok) continue;
      const m = parseNbbCsv(await csv.text());
      if (!m.fiscal_year) continue;
      const { error } = await sb.from("fin_competitor_metrics").upsert({
        user_id: context.userId, competitor_id: comp.id, fiscal_year: m.fiscal_year, scope: "enkelvoudig",
        revenue: m.revenue, gross_margin: m.gross_margin, profit: m.profit, equity: m.equity, employees: m.employees,
        source: `NBB Balanscentrale ${m.reference ?? d.reference}`, retrieved_at: new Date().toISOString().slice(0, 10),
      }, { onConflict: "competitor_id,fiscal_year,scope" });
      if (!error) years.push(m.fiscal_year);
    }
    if (years.length && !comp.enterprise_number?.match(/^\d{10}$/)) await sb.from("fin_competitors").update({ enterprise_number: nr }).eq("id", comp.id);
    return { imported: years.length, years, error: all.length ? null : "Geen neergelegde jaarrekeningen gevonden voor dit nummer." };
  });

export const parseAccountsPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { competitorId: string; pdfBase64: string; fileName: string }) => {
    if (d.pdfBase64.length > 14_000_000) throw new Error("PDF is groter dan 10 MB");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertFinanceAdmin(context);
    const sb = context.supabase as any;
    const { data: comp } = await sb.from("fin_competitors").select("id").eq("id", data.competitorId).maybeSingle();
    if (!comp) throw new Error("Concurrent niet gevonden");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is niet geconfigureerd");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: 'Je leest een Belgische jaarrekening (NBB-model). Antwoord enkel met JSON: {"fiscal_year":number,"revenue":number|null,"gross_margin":number|null,"profit":number|null,"equity":number|null,"employees":number|null}. revenue = rubriek 70 omzet, gross_margin = 9900 brutomarge, profit = 9904 winst/verlies van het boekjaar, equity = 10/15 eigen vermogen, employees = 9087 gemiddeld aantal FTE, boekjaar = jaar van einddatum. Bedragen in euro, huidig boekjaar (niet het vorige). Niet vermeld = null. Verzin niets.' },
          { role: "user", content: [
            { type: "text", text: "Lees de kerncijfers uit deze jaarrekening." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${data.pdfBase64}` } },
          ] },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Even te veel aanvragen, probeer zo opnieuw.");
    if (res.status === 402) throw new Error("AI-tegoed is op.");
    if (!res.ok) throw new Error("PDF kon niet gelezen worden.");
    const txt: string = (await res.json())?.choices?.[0]?.message?.content ?? "";
    let m: CompetitorMetrics;
    try { m = JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch { throw new Error("Geen cijfers herkend in deze PDF."); }
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    if (!Number.isInteger(m.fiscal_year) || m.fiscal_year < 1990) throw new Error("Boekjaar niet herkend in deze PDF.");
    const row = { revenue: n(m.revenue), gross_margin: n(m.gross_margin), profit: n(m.profit), equity: n(m.equity), employees: n(m.employees) };
    const { error } = await sb.from("fin_competitor_metrics").upsert({
      user_id: context.userId, competitor_id: comp.id, fiscal_year: m.fiscal_year, scope: "enkelvoudig", ...row,
      source: `PDF ${data.fileName.slice(0, 80)}`, retrieved_at: new Date().toISOString().slice(0, 10),
    }, { onConflict: "competitor_id,fiscal_year,scope" });
    if (error) throw new Error("Opslaan mislukt");
    return { fiscal_year: m.fiscal_year, ...row };
  });
