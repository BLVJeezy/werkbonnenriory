# Attributie-API – facturen

`POST /api/public/attribution/invoices` voedt het eigen server-side marketingdashboard. Los van de reviewfeed (REVIEW_API.md), die mager blijft.

## Authenticatie
`Authorization: Bearer <ATTRIBUTION_API_TOKEN>` – eigen gedeelde sleutel, nooit de reviewtoken. Alleen server-side gebruiken: dit endpoint deelt klantgegevens en bedragen.

## Aanvraag
```json
{ "limit": 100, "cursor": { "updated_at": "2026-11-03T09:00:00.123+00:00", "id": "uuid" } }
```
`limit` 1..100 (standaard 100); `cursor` weglaten voor de eerste pagina. Max 4 KB.

## Antwoord
```json
{ "version": 1, "invoices": [ {
  "id": "uuid", "number": "20260900", "kind": "factuur|creditnota", "status": "verzonden",
  "issue_date": "2026-11-02", "due_date": "2026-11-16", "sent_at": "...", "paid_at": null, "paid_amount": 0,
  "net": 100, "vat": 21, "total": 121, "vat_rate": 21, "credit_for": null,
  "created_at": "...", "updated_at": "...",
  "customer": { "id": "uuid|null", "name": "...", "email": "...|null", "phone": "...|null", "postal_code": "3740", "city": "Bilzen", "vat_number": null },
  "lines": [ { "description": "...", "quantity": 1, "unit_price_excl_vat": 100, "amount_excl_vat": 100 } ],
  "work_orders": [ { "id": "uuid", "activity": "Ontstopping", "signed_at": "...", "postal_code": "3740", "first_customer": false } ]
} ], "next_cursor": { "updated_at": "...", "id": "uuid" }, "has_more": false }
```

- Sortering en cursor op `(updated_at, id)` oplopend. `updated_at` wordt bij elke wijziging door een trigger bijgewerkt (bestaande facturen: backfill op `created_at`), dus gewijzigde facturen (betaald, verzonden, aangepast) komen opnieuw langs: upsert op `id`.
- Concepten die nooit verzonden zijn worden weggelaten (die kunnen nog verwijderd worden). Een concept verschijnt zodra het verzonden wordt.
- Creditnota's staan erbij met hun eigen bedragen zoals opgeslagen; de afnemer maakt ze zelf negatief. `credit_for` verwijst naar de oorspronkelijke factuur.
- `customer`: naam/mail/telefoon/postcode/plaats/btw komen uit de factuursnapshot (wat gefactureerd is). `customer.id` is de stabiele `customers.id`, afgeleid via de gekoppelde werkbon (hoofdwerkbon eerst, anders extra werkbonnen, bij creditnota zonder werkbon via de oorspronkelijke factuur); `null` als er geen werkbon met klant is. Gebruik nooit het mailadres als sleutel. `phone` is `null` als de snapshot geen telefoon bevat.
- `work_orders` bevat zowel `work_order_id` als alle `extra_work_order_ids` (hoofdwerkbon eerst); `activity` is de naam uit activiteiten.

## Foutcodes
503 sleutel niet ingesteld · 401 geen/foute sleutel · 413 aanvraag te groot · 400 ongeldige aanvraag · 500 ophalen mislukt.
