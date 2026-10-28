# Mailtaken: verkoopfacturen uit Riory Werkbonnen

Ontvangende app moet dit in haar eigen chat implementeren; deze chat heeft uitsluitend leesrechten op Mailtaken.

- Bron: POST `https://werkbonnenriory.lovable.app/api/public/bookkeeping/sales` met `Authorization: Bearer ${MAILTAKEN_SALES_SYNC_TOKEN}` en JSON `{ "offset": 0, "limit": 100 }`. Volg `nextOffset` tot null; periodiek opnieuw lezen om betaalstatus bij te werken.
- Gedeeld token via beveiligde secretformulieren in beide apps, nooit in chat. Bron moet gepubliceerd zijn.
- Antwoord versie 1: source `riory-werkbonnen`, invoices met stabiele id, number, kind, credit_for, issue_date, due_date, customer snapshot, lines, vat_rate, net/vat/total, paid_amount/paid_at, status, created_at.
- Mailtaken mapping: richting verkoop; kind creditnota behouden, negatieve bedragen niet dubbel omkeren; source `riory-werkbonnen`, source_ref bron-ID. Unieke deduplicatie per bedrijf/bron/bron-ID, ook handmatige en contractfacturen ondersteunen.
- Vraag expliciete koppeling naar het juiste finance_company_id. Niet willekeurig een bedrijf kiezen. Import mag bestaande Simpla-boekingen niet dupliceren: overeenkomstige nummer/klant/datum/bedrag als mogelijke dubbele bron melden ter beoordeling.
- Sla facturen/lijnen op en laat goedkeuring/boekingen via bestaande gecontroleerde `fin_post_entry` lopen; nooit boekingen stil overschrijven of bedragen herberekenen met afwijkende btw-regels.
- Geen OkiOki- of herinneringsmails als aparte verkoopfactuur importeren.