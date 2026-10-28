# Contractbeheer en facturatie na elke beurt

## Gewenst resultaat
- Een aparte **Contracten**-pagina in het beheerdersmenu. De kalender behoudt de contracttaken, met een link naar contractbeheer.
- Na elke afgewerkte contractbeurt wordt automatisch een factuur volgens het contract aangemaakt en verstuurd vanuit **info@riory.be**.
- De contractwerkbon blijft een informatiedocument: geregistreerde uren, kilometers en materialen worden niet nogmaals afzonderlijk gefactureerd.

## Contracten beheren
- Alle negen geïmporteerde, gestarte contracten behouden hun oorspronkelijke nummer, klant en bronregels.
- Per contract kun je klant, omschrijving, ploeg, activiteit, beurtritme, eerstvolgende beurt en einddatum aanpassen.
- Naast de planning komt **Facturatie na elke beurt** met een afzonderlijke aan/uit-keuze.
- Toon de overgenomen contractregels met aantallen, eenheidsprijzen, kortingen, btw en het factuurbedrag per beurt. Laat deze controleren en aanpassen zonder de originele importgegevens te overschrijven.
- Activeren vereist bevestiging dat deze bedragen **per uitgevoerde beurt** gelden. De Excel vermeldt namelijk geen ondubbelzinnige facturatieafspraak; contractduur wordt niet als betaalritme geïnterpreteerd.
- Geen automatische facturen voor historische beurten bij het activeren. Alleen beurten die daarna worden afgerond komen automatisch in aanmerking.

## Automatische contractfactuur
- Afronding van een contracttaak maakt één facturatieopdracht aan, onafhankelijk van het slagen van de werkbonmail.
- De factuur gebruikt de gecontroleerde contractregels en klantgegevens, met verwijzing naar contractnummer en uitgevoerde beurt.
- Gebruik de bestaande factuurnummering en ingestelde betalingstermijn. Kortingen en btw worden correct verwerkt; verschillende btw-tarieven worden ondersteund in PDF en UBL.
- Verstuur ook onbetaalde contractfacturen automatisch, zoals gekozen; de controleplicht voor gewone openstaande facturen blijft ongewijzigd.
- Klant ontvangt PDF en UBL; OkiOki blijft onzichtbaar in BCC. Algemene voorwaarden blijven in dezelfde PDF.
- Contractfacturen staan tussen de andere facturen, met herkenbare contractverwijzing; bestaande creditnota's en betalingsherinneringen blijven werken.

## Controle en fouten
- Contractbeheer toont per uitgevoerde beurt de gekoppelde factuur, verzendstatus en eventuele fout.
- Opnieuw verwerken mag geen tweede factuur voor dezelfde beurt maken.
- Een mislukte werkbonmail verhindert de contractfacturatie niet. Een onzekere factuurverzending wordt niet blind opnieuw verzonden.
- Stopzetten stopt nieuwe planning en automatische facturatie voor later afgeronde beurten; reeds gemaakte facturen blijven behouden.

## Technische aanpak
- Aparte adminroute `/contracten`, met eigen paginatitel en bestaande toegangsbescherming.
- Genormaliseerde factuurregels en facturatie-activatie op contracten; facturen krijgen contractherkomst, met unieke koppeling aan de uitgevoerde beurt.
- Databasegestuurde wachtrij voor afrondingen, beveiligde serververwerking en periodieke verwerking via de bestaande ondersteunde planningvoorziening.
- Bestaande factuurverzending hergebruiken; gewone werkbonfacturatie blijft contracttaken uitsluiten.
- Btw per regel uitbreiden in factuurberekening, PDF, UBL en creditnota's, met behoud van bestaande facturen.
- Tests voor contractbedragen/kortingen/btw, één factuur per beurt, activatiedatum, stopzetten en uitsluiting van normale werkbonfacturatie. Controle van beheer, afronding en factuurweergave met tijdelijke gegevens; geen echte klantmail als test.