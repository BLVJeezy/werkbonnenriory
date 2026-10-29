# Reviewaanvragen: verzonden facturen ophalen

## Endpoint

`POST https://werkbonnenriory.lovable.app/api/public/reviews/invoices`

Headers:
- `Authorization: Bearer <de gedeelde REVIEW_INVOICES_API_TOKEN>`
- `Content-Type: application/json`

Body bij eerste aanvraag: `{"limit":100}`.

Antwoord (voorbeeldgegevens):

```json
{
  "version": 1,
  "invoices": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "email": "klant@example.com",
      "sent_at": "2026-10-29T12:00:00Z"
    }
  ],
  "next_cursor": {
    "sent_at": "2026-10-29T12:00:00Z",
    "id": "00000000-0000-4000-8000-000000000001"
  },
  "has_more": false
}
```

Geef de laatste niet-lege `next_cursor` bij de volgende aanvraag mee als `cursor`, naast `limit`. Bewaar die ook wanneer `has_more` false is; dan worden volgende keren nieuwe verzendingen opgehaald. Bij een lege pagina is `next_cursor` null: behoud je vorige cursor. Bij `has_more: true` direct de volgende pagina ophalen. Ongeldige e-mailadressen worden overgeslagen; een lege `invoices`-lijst kan daarom toch voortgang hebben.

Alleen `kind=factuur`, `status=verzonden` en een ingevulde `sent_at` komen in aanmerking; creditnota’s, concepten en mislukte/onzekere verzendingen zijn uitgesloten. Het e-mailadres komt uit de opgeslagen factuurklant (dus het facturatieadres wanneer dat gekozen is). Geen bedragen, factuurregels, adressen of namen worden gedeeld.

Verzonden betekent: Outlook heeft de verzending aanvaard en de app heeft deze geregistreerd; dit bewijst niet dat de klant de mail ontvangen of gelezen heeft.

## Dubbelen voorkomen

Het reviewsysteem moet `id` als unieke gebeurtenissleutel bewaren en maximaal één reviewaanvraag per factuur starten. Bewaar verwerking en cursor betrouwbaar; herhaalde aanvragen kunnen dezelfde factuur teruggeven. De API verstuurt zelf geen reviewmail. De eerste aanvraag zonder cursor bevat ook eerder verzonden facturen. Start met een cursor op de gewenste ingangsdatum en ID `00000000-0000-0000-0000-000000000000` om historische verzendingen over te slaan.

## Beveiliging en ingebruikname

Gebruik een aparte gedeelde sleutel `REVIEW_INVOICES_API_TOKEN`, alleen op de server van het reviewsysteem, nooit in browsercode of queryparameters. Stel deze in via het beveiligde sleutelformulier en kopieer dezelfde sleutel naar het reviewsysteem. Deze API deelt klantmailadressen uitsluitend na sleutelcontrole; geef de sleutel enkel aan vertrouwde beheerders. Gebruik HTTPS. Publiceer deze appwijziging voordat het andere systeem de productie-URL gebruikt.

Foutcodes: 401 ongeldige sleutel, 400 ongeldige aanvraag, 413 te grote aanvraag, 503 sleutel nog niet ingesteld, 500 ophalen mislukt. Paginalimiet: 1–100.