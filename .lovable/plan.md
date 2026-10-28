# Afspraak laten plannen door de toegewezen ploeg

## Wat er bijkomt
- Op **Ploegen**: keuze **Zelf afspraken plannen**. Voor deze ploegen zijn prijzen, totalen, afrekenen en offertes niet toegankelijk. De keuzes van andere ploegen blijven behouden.
- Bij een open taak: adminknop **Doorzetten naar ploeg**. Dit kan alleen met een toegewezen zelfplannende ploeg en een klant-e-mailadres. Een bestaande planning vervangen vraagt bevestiging.
- De ploeg ziet de aanvraag op het beginscherm onder **Afspraken te plannen**, met klant, volledig uitvoeringsadres, contactpersoon en omschrijving. De oorspronkelijke mail wordt niet doorgestuurd: deze kan prijsinformatie bevatten.
- De ploeg kiest een **datum**, **tijdsvak vanaf** en **tijdsvak tot**. Daarna ontvangt de klant een prijsloze voorstelmail vanuit de bestaande mailbox **info@riory.be**, met een bevestigingslink.
- De klant ziet datum, tijdsvak en uitvoeringsadres en kiest **Afspraak bevestigen** of **Dit moment past niet**.
- Alleen bij bevestiging komt de taak op de gekozen dag in de app-agenda, inclusief tijdsvak. De toegewezen ploeg krijgt **Afspraak bevestigd** in het ploegscherm. Een geweigerd voorstel verschijnt opnieuw als te plannen.
- Admin en ploeg zien of een aanvraag wacht op datumkeuze, klantbevestiging of een nieuwe datum. Bevestigde toekomstige afspraken blijven voor de zelfplannende ploeg zichtbaar in een aparte afsprakenlijst; de bestaande taken van vandaag en morgen blijven behouden.

## Behoud en foutafhandeling
- Geen wijzigingen aan afgeronde werkbonnen, bestaande betalingen, offertes of prijzen.
- Mailfouten worden zichtbaar; de opgeslagen datum gaat niet verloren en er komt een gerichte herprobeerknop. Een geaccepteerde mail wordt als verzonden geregistreerd, niet als aantoonbaar afgeleverd.
- Een nieuwe datum of andere toegewezen ploeg maakt de oude bevestigingslink ongeldig. Herhaald bevestigen maakt geen tweede afspraak.
- De klant wordt niet automatisch bevestigd door het openen van de mail of link: bevestigen vraagt een expliciete knopdruk.

## Technische uitvoering
- Bewaar planningsaanvragen met toegewezen ploeg, versie, datum/tijdsvak, status, bevestiging en mailresultaat. Voeg tijdsvakvelden toe aan de bestaande agendaplanning.
- Gebruik een willekeurige, vervallende klantlink en toon daarop uitsluitend afspraakgegevens; geen offertes, bedragen of andere taken.
- Controleer bij iedere ploegactie de ingelogde ploeg én de actuele taaktoewijzing. Laat de klantbevestiging en agendawijziging in één databasehandeling plaatsvinden.
- Maak prijsvrije gegevenslezing voor zelfplannende ploegen en blokkeer directe toegang tot prijsdragende gegevens. Alleen teksten visueel verbergen is onvoldoende. Hergebruik de bestaande prijs- en toegangsregels voor andere ploegen en admins.
- Gebruik de bestaande persoonlijke Outlook-koppeling; geen Lovable-mail, afzenderdomein of nieuwe ploeg-e-maillogin.

## Controle
- Test admin doorzetten → toegewezen ploeg kiest datum/tijdsvak → klant bevestigt → agenda en ploeg lezen dezelfde afspraak terug.
- Test weigeren, mailfout en herproberen, gewijzigde datum/toewijzing, verlopen link en dubbel bevestigen.
- Test dat een andere ploeg geen voorstel kan wijzigen en dat een zelfplannende ploeg geen prijzen of offertes ontvangt, ook niet via rechtstreeks opgevraagde gegevens.
- Gebruik tijdelijke proefgegevens; verstuur geen proefmail naar een echte klant zonder een afgesproken testontvanger.