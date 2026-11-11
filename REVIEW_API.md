# Riory Review-API

Met deze API haalt jullie extern reviewsysteem op welke klanten een reviewmail moeten krijgen. De app verstuurt zelf geen reviewmail.

## Aanbevolen: na elke afgewerkte werkbon

`POST https://werkbonnenriory.lovable.app/api/public/reviews/werkbonnen`

Headers:
- `Authorization: Bearer <REVIEW_INVOICES_API_TOKEN>`
- `Content-Type: application/json`

Eerste aanvraag: `{"limit":100}`

Antwoord (voorbeeld):

```json
{
  "version": 1,
  "work_orders": [
    { "id": "00000000-0000-4000-8000-000000000001", "email": "klant@example.com", "completed_at": "2026-11-02T12:00:00Z", "customer_name": "Jan Peeters" }
  ],
  "next_cursor": { "completed_at": "2026-11-02T12:00:00Z", "id": "00000000-0000-4000-8000-000000000001" },
  "has_more": false
}
```

Volgende aanvragen: `{"limit":100,"cursor":{"completed_at":"…","id":"…"}}` met de laatst ontvangen niet-lege `next_cursor`.

- Afgewerkt = werkbon afgetekend (handtekening) of afgerekend. `completed_at` is het moment van aftekenen, anders van afrekenen.
- E-mail = het mailadres op de werkbon (de persoon die de monteur gezien heeft), anders het facturatie-e-mailadres. Werkbonnen zonder geldig adres worden overgeslagen (cursor schuift wel op).
- `customer_name` = de klantnaam op de werkbon, om de klant bij naam te groeten; kan `null` zijn als er geen naam bekend is.
- Automatisch afgesloten onderaannemersopdrachten (zonder handtekening van de klant) verschijnen niet in deze feed.
- Geen adressen, prijzen of foto's worden gedeeld.
- Een heropende en opnieuw afgetekende werkbon kan opnieuw verschijnen met dezelfde `id`: stuur maximaal één reviewmail per `id`.

## Alternatief: na verzonden factuur

`POST https://werkbonnenriory.lovable.app/api/public/reviews/invoices` — zelfde sleutel en werking, maar met `invoices[]` en cursor `{ "sent_at", "id" }`. Enkel verzonden facturen (geen creditnota's of concepten).

## Werkwijze voor het reviewsysteem

1. Roep de API periodiek aan (bv. elk kwartier).
2. Bij `has_more: true` meteen de volgende pagina ophalen.
3. Bewaar de cursor betrouwbaar; bij een lege pagina (`next_cursor: null`) de vorige cursor behouden.
4. Bewaar elke `id` als unieke sleutel om dubbele reviewmails te voorkomen.
5. Historiek overslaan: start met cursor `{"completed_at":"<startdatum>","id":"00000000-0000-0000-0000-000000000000"}`.
6. Verstuur de reviewmail zelf, eventueel met wat vertraging (bv. 1 dag na het werk).

## Beveiliging

De gedeelde sleutel `REVIEW_INVOICES_API_TOKEN` hoort alleen op de server van het reviewsysteem, nooit in browsercode of in de URL. Gebruik altijd HTTPS.

## Foutcodes

| Code | Betekenis |
|---|---|
| 400 | Ongeldige aanvraag |
| 401 | Ongeldige of ontbrekende sleutel |
| 413 | Aanvraag te groot |
| 500 | Ophalen mislukt |
| 503 | Sleutel nog niet ingesteld |

Paginalimiet: 1–100.
