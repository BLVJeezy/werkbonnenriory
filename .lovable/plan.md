# Boekhouding en Finance volledig overnemen

## Resultaat
Boekhouding en Finance uit **Mail Assist AI** worden echte onderdelen van **Riory Werkbonnen**, zonder iframe en zonder aparte Mail Assist AI-login. De bestaande functies, schermindeling en boekhoudkundige berekeningen blijven behouden. De werkbonnen, facturen en bankverrichtingen die al in deze app staan blijven intact.

## Wat wordt overgenomen
- **Finance:** overzicht per bedrijf en periode, invoer en spreadsheetimport, budgetten, factuurbeoordeling, aangeleerde indelingsregels, investeringen en afschrijvingen, leningen, concurrentencijfers en koppelingen.
- **Boekhouding:** rekeningschema en MAR, dagboeken, saldibalans, balans en resultaat, btw-overzicht, bankverwerking, vaste boekingen, kredietaflossingen en herklasseringen.
- Bestaande controles op evenwichtige boekingen, dubbele invoer, eigendom, creditnota’s en beoordelingsstatus.
- Financiële opvolgtaken, met dezelfde aanmaak- en afsluitregels als in de bronapp, bereikbaar binnen deze app.

## Inbouwen
1. Neem de bestaande rekenhelpers en hun tests over; pas alleen de noodzakelijke aansluitingen aan deze app aan.
2. Voeg de financiële opslag en boekingsfuncties toe zonder bestaande factuur-, klant- of bankgegevens te vervangen.
3. Voeg **Boekhouding** en **Finance** aan het beheerdersmenu toe. Ploegen en marketing krijgen geen toegang, ook niet via rechtstreekse aanvragen.
4. Sluit verkoopfacturen en creditnota’s rechtstreeks aan op de facturen in deze app, met behoud van de dubbele-invoercontrole. Er ontstaat geen tweede facturatienummering of alternatieve verzendroute.
5. Behoud Simpla voor het lezen van aankoopgegevens; geen verkoopfacturen naar Simpla schrijven. Laat Ponto de bestaande beveiligde koppeling gebruiken zonder automatische betalingen of extra herinneringen te activeren.
6. Neem de NBB-cijfers en bestaande PDF-uitlezing over met dezelfde inhoudelijke regels.

## Bestaande gegevens overzetten
De broncode is beschikbaar, maar de privégegevens van Mail Assist AI zijn vanuit deze chat niet leesbaar. Hiervoor is een export nodig vanuit de chat van **Mail Assist AI**:

- Bedrijven, rekeningen, dagboekposten en lijnen.
- Financiële facturen en lijnen, indelingsregels, budgetten en maandcontroles.
- Investeringen, leningen en aflossingsschema’s, vaste boekingen.
- Bankverrichtingen en hun koppelingen, concurrentencijfers, auditgeschiedenis en financiële opvolgtaken.
- Eventuele private documentbijlagen apart, zonder sleutels, wachtwoorden of mailboxsessies.

Importeer de export met behoud van onderlinge verwijzingen en bron-ID’s, gekoppeld aan het juiste beheerdersaccount. Controleer aantallen en financiële totalen vóór en na import. Verwijder niets uit Mail Assist AI.

**De onderdelen kunnen gebouwd worden vóór de export; de overdracht van bestaande gegevens blijft wachten op die bestanden.** Dienstkoppelingen uit Mail Assist AI worden niet stilzwijgend meegekopieerd; ontbrekende toegang wordt afzonderlijk aangegeven.

## Technische aanpak
- Eigen afgeschermde pagina’s binnen de huidige TanStack-app; bronmodules krijgen waar nodig een afzonderlijke naam om conflicten met bestaande facturatie en Ponto te vermijden.
- Nieuwe `fin_*`-gegevens en boekingsfuncties met beheerdercontrole en bedrijf/eigendomscontrole. De bronberekeningen blijven de basis; geen herimplementatie van afschrijvingen, btw of dubbele boekhouding.
- Bestaande verkoopfacturen en Ponto-verrichtingen worden via gecontroleerde interne aansluitingen verwerkt, niet via een publieke aanvraag aan dezezelfde app.
- Opvolgtaken blijven gescheiden van uitvoertaken voor ploegen, zodat financiële waarschuwingen niet als interventies in de planning terechtkomen.

## Controle
- Draai de overgenomen reken- en integriteitstests plus tests voor toegang en dubbele verwerking.
- Test als beheerder: bedrijf kiezen, factuur beoordelen, evenwichtige boeking maken, bankverrichting verwerken en resultaten teruglezen.
- Controleer dat ploegen en marketing geen financiële gegevens kunnen lezen of wijzigen.
- Controleer beide pagina’s op brede en smalle schermen en behoud de bestaande facturatieflow.
- Rapporteer ontbrekende exports of diensttoegang expliciet; geen volledige gegevensoverdracht claimen voordat totalen gecontroleerd zijn.