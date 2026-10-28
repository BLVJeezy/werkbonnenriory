# Afspraak laten plannen door de toegewezen ploeg

## Wat er bijkomt
- Op **Ploegen**: een **Externe ploeg** toevoegen met naam en e-mailadres, zonder login of toegang tot het systeem. Deze ploeg krijgt uitsluitend afspraaklinks, nooit prijzen of offertes. Bestaande interne ploegen en hun keuzes blijven behouden.
- Bij een open taak: adminknop **Doorzetten naar ploeg**. Dit kan alleen met een toegewezen zelfplannende ploeg en een klant-e-mailadres. Een bestaande planning vervangen vraagt bevestiging.
- De externe ploeg ontvangt vanuit **info@riory.be** een mail met een beperkte invullink voor deze ene afspraak. Daar staan klant, volledig uitvoeringsadres, contactpersoon en prijsloze werkomschrijving. De oorspronkelijke mail wordt niet doorgestuurd: deze kan prijsinformatie bevatten.
- Via de invullink kiest de ploeg een **datum**, **tijdsvak vanaf** en **tijdsvak tot**, zonder inloggen. Daarna ontvangt de klant een prijsloze voorstelmail vanuit de bestaande mailbox **info@riory.be**, met een bevestigingslink.
- De klant ziet datum, tijdsvak en uitvoeringsadres en kiest **Afspraak bevestigen** of **Dit moment past niet**.
- Alleen bij bevestiging komt de taak op de gekozen dag in de app-agenda, inclusief tijdsvak. De toegewezen externe ploeg ontvangt een **bevestigingsmail**. Bij weigering ontvangt de ploeg een bericht om via een nieuwe invullink een ander moment te kiezen.
- Admin ziet per taak of de aanvraag wacht op datumkeuze, klantbevestiging of een nieuwe datum. De ploeglink toont uitsluitend de status van die ene afspraak; geen takenlijst, agenda of andere appschermen.

## Behoud en foutafhandeling
- Geen wijzigingen aan afgeronde werkbonnen, bestaande betalingen, offertes of prijzen.
- Mailfouten worden zichtbaar; de opgeslagen datum gaat niet verloren en er komt een gerichte herprobeerknop. Een geaccepteerde mail wordt als verzonden geregistreerd, niet als aantoonbaar afgeleverd.
- Een nieuwe datum of andere toegewezen ploeg maakt de oude bevestigingslink ongeldig; bij andere ploeg wordt ook de vorige ploeglink ongeldig. Herhaald bevestigen maakt geen tweede afspraak.
- De klant wordt niet automatisch bevestigd door het openen van de mail of link: bevestigen vraagt een expliciete knopdruk.

## Technische uitvoering
- Bewaar planningsaanvragen met toegewezen ploeg, versie, datum/tijdsvak, status, bevestiging en mailresultaat. Voeg tijdsvakvelden toe aan de bestaande agendaplanning.
- Gebruik afzonderlijke willekeurige, vervallende ploeg- en klantlinks. Toon uitsluitend prijsloze afspraakgegevens en controleer op iedere handeling het token, de actuele versie en de taaktoewijzing. Laat de klantbevestiging en agendawijziging in één databasehandeling plaatsvinden.
- Externe ploegen krijgen geen account. De publieke invulpagina kan nooit andere taken, prijsgegevens of offertes opvragen. Bestaande interne ploegrechten worden niet aangepast.
- Gebruik de bestaande persoonlijke Outlook-koppeling; geen Lovable-mail, afzenderdomein of externe ploeglogin. Sla het echte ontvangstadres van de externe ploeg op bij het aanmaken.

## Controle
- Test admin doorzetten → externe ploeg kiest datum/tijdsvak via link → klant bevestigt → agenda en bevestigingsmail bevatten dezelfde afspraak.
- Test weigeren, mailfout en herproberen, gewijzigde datum/toewijzing, verlopen link en dubbel bevestigen.
- Test dat een ongeldige of ingetrokken ploeglink geen voorstel kan wijzigen en dat externe ploegen geen prijzen, offertes of systeemtoegang krijgen, ook niet via rechtstreeks opgevraagde gegevens.
- Gebruik tijdelijke proefgegevens; verstuur geen proefmail naar een echte klant zonder een afgesproken testontvanger.