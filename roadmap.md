# Roadmap

- [ ] Factuurmails rechtstreeks via een externe verzenddienst, met behoud van PDF/UBL en OkiOki; aflevering en vermoedelijke opening apart tonen. Activering wacht op de verzenddienstkoppeling en domeinverificatie.
- [ ] Uitleg geven voor het veilig aanmaken en koppelen van de Brevo-API-sleutel.
- [ ] Vaststellen welke stap van de Brevo-koppeling niet werkt en het concrete probleem verhelpen; wacht op foutmelding of schermafbeelding.

- [x] Voorbeeld van de offerte-mails getoond (met en zonder keuzemogelijkheden), als afbeelding opgeslagen in Files.
- [x] Offertemail verduidelijkt dat de prijs pas definitief is na het maken van een keuze, enkel wanneer de offerte keuzemogelijkheden bevat; drie tests geslaagd.

- [x] Productfoto’s via slepen toevoegen en ontbreken van fotogegevens veilig afhandelen; sleepload, productopslag, offerte/PDF/klantbeeld gecontroleerd, zeven tests geslaagd.

- [x] Productfoto’s uploaden/beheren en automatisch opnemen in offertebewerker, PDF en klantondertekenpagina; upload/opslag/klantbeeld en ingebedde originele PDF-foto gecontroleerd, zes tests geslaagd. Tijdelijk product verwijderd, offerte hersteld; geen mail verstuurd.

- [x] Eerste klant aanvinken in Kalender/Taken; gedeeld label in ploegoverzicht en detail. Opslaan na herladen en uitschakelen gecontroleerd; testmarkering verwijderd.

- [x] WhatsApp-uitnodiging met ploeguitleg en persoonlijke wachtwoordkeuze. Aanmaak, wachtwoord opslaan, ploeglogin en weigering van hergebruik gecontroleerd; 7 tests geslaagd. Tijdelijke testploegen verwijderd, geen WhatsApp verzonden.

- [x] Nieuwe interne ploegen via WhatsApp uitnodigen na aanmaken of vanuit de ploegenlijst; uitgebreid met eigen wachtwoordkeuze hierboven.

- [x] Bankafpunting en Ponto-bediening naar Boekhouding; oude Bank-link verwijst door. Atomair afpunten werkt betalingen en boekingen samen bij; deelbetalingen blijven open en overbetalingen worden geweigerd. Navigatie, bestaande betaalstatus en foutpad gecontroleerd; geen echte betaling handmatig geregistreerd tijdens controle.

- [x] /index stuurt door naar Taken; met beheerderlogin gecontroleerd, geen paginafouten.
- [x] Werkbon-importknop verwijderd; lokale verkoopfacturen automatisch aan Riory BV gekoppeld, los van Simpla-aankopen. Geïmporteerde nummers behouden; 10 betaalde lokale facturen correct gekoppeld zonder dubbele boeking. Gerichte tests geslaagd.

- [x] Afgewerkte werkbonnen op een aparte overzichtspagina, los van actieve taken; zoeken, ploeg/datumfilters, sortering en voorbeelden gecontroleerd.

- [x] Boekhouding en Finance van Mail Assist AI volledig ingebouwd, met behoud van rekenmodules en tabbladen; geen iframe. Invoer, beoordeling, boeking, btw en bankverwerking getest.
- [x] Riory BV-balans per 31/10/2026 geïmporteerd: 91 rekeningsaldi, sluitende balans en resultaat gecontroleerd.
- [x] Volledige Boekhouding/Finance-export overgenomen: 3 administraties, 4.512 boekingen/10.051 lijnen, 1.575 facturen, investeringen, leningen, budgetten, regels en historie. 1.678 bestaande Ponto-verrichtingen herkend, 60 nieuwere behouden; cumulatieve Excel-boeking vervangen. Evenwicht, aantallen, facturen en bankkoppelingen in de app gecontroleerd; 38 rekentests geslaagd.

- [x] Bankverrichtingen handmatig aan een factuur koppelen, met veilige betaalregistratie en controle in de app.

- [x] Bankpagina met alle Ponto-verrichtingen, automatisch ververst (30s), afletteringsbadge per verrichting
- [x] Gestructureerde factuurmededelingen in PDF, UBL en betaalcode, met betalingscontrole en tests.
- [x] Betaalcode op de factuur zelf voor het openstaande bedrag.
- [x] App-icoon in Riory-huisstijl voor de admin (favicon + apple-touch-icon) én als JPG-download.
- [x] Knop 'Terug naar nog in te plannen' op takenlijst en kalender.
- [x] Eerste betalingsherinnering automatisch na vervaldatum (dagelijks).
- [x] Klantnummers opnieuw overal zichtbaar: nieuwe klanten krijgen automatisch het volgende 6-cijferige nummer; ontbrekende nummers aangevuld.
- [x] Facturenlijst: kolom Betaald toont altijd een bedrag; rij groen bij betaald, wit bij open, rood bij vervallen.
- [x] Facturen en offertes: productnaam vetgedrukt met de lange omschrijving eronder als bijvoegsel, ook op de klantondertekenpagina; regeleinden blijven behouden.
