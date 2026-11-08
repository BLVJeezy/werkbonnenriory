# Tikklok volledig integreren zonder gegevensverlies

## Vastgesteld in de aangeleverde export
- 25 tabellen met 369 rijen: onder meer 5 medewerkers, 177 klokregistraties, 7 correctieaanvragen, 7 overurenaanpassingen, 13 loonberekeningen en 10 verzendregistraties van maandrapporten.
- Eén gearchiveerd contract bevat beide handtekeningen. De export bevat geen afzonderlijke personeelsdocumenten of ingevulde bestandsverwijzingen.
- Alle gecontroleerde medewerkerverwijzingen bestaan; geen klokregistratie staat open in deze export.
- De vijf pincodes zijn opgeslagen als bcrypt-hashes. Deze blijven privé en worden nooit opgenomen in appbroncode of zichtbare rapporten.
- De export is een momentopname van 8 november, geen bewijs dat later ingevoerde gegevens al zijn meegenomen.

## Wat er wordt gebouwd
1. **Afzonderlijk tikklokonderdeel binnen Riory.** Onder Medewerkers komen de bestaande beheerschermen; een eigen tabletpagina behoudt het inklokscherm met pincode en toestelgoedkeuring. De werkbonnenapp blijft ongewijzigd werken.
2. **Alle bestaande functies behouden.** Medewerkers, werkuren, correcties, uurroosters, overuren, verlof, afwezigheden, berichten, kalender, verjaardagen, incidenten, HR-dossiers, contracten en ondertekening, loonberekeningen, rapporten en toestelbeheer.
3. **Veilige volledige overdracht.** De originele nummers, onderlinge koppelingen, contractinhoud, handtekeningen, instellingen en historische verzendstatussen behouden. Bedrijfsvelden die door een algemene veiligheidsfilter onterecht worden verwijderd, zoals het sociaal secretariaat, apart veilig overdragen. Beheerdersidentiteit en eventuele overige bestanden controleren vóór afronding.
4. **Bestaande toegang beschermen.** HR- en loongegevens blijven uitsluitend voor bevoegde beheerders. Medewerkers krijgen enkel hun eigen gegevens via de bestaande pincode-/toestelcontrole; ploegen krijgen geen bijkomende toegang.
5. **Vergelijken en testen vóór omschakeling.** Aantallen, waarden en relaties per tabel vergelijken; berekeningen met de bestaande tests vergelijken; inloggen, inklokken, uitklokken, correcties, contracten, rapporten en belangrijke beheeracties controleren. Testgegevens nadien opruimen.
6. **Geen verlies bij de overgang.** De oude tikklok blijft actief. Na controle volgt een laatste aanvullende export voor nieuwe of gewijzigde gegevens en een korte afgesproken omschakeling. De oude tikklok pas buiten gebruik stellen na jouw uitdrukkelijke goedkeuring; niet vanuit deze chat verwijderen.

## Technische aanpak
- Tikkloktabellen en modules isoleren met een eigen naamruimte: de bestaande werkbonnen gebruiken al `time_entries` en `user_roles` en mogen niet worden overschreven.
- De huidige Riory-router, versies, aanmeldstructuur en opstartbestanden behouden; alleen de relevante bronmodules en schermen aanpassen en integreren.
- Gegevens en pincodehashes uitsluitend in afgeschermde Lovable Cloud-opslag importeren, niet als bestanden die de app publiek serveert.
- Oude beheerder-ID's behouden voor historische toeschrijving; actuele toegang afzonderlijk en gecontroleerd koppelen aan Riory-beheerders. Een geïmporteerde rolregel verleent niet automatisch rechten.
- Bestaande mail- en rapportfuncties behouden; oude verzendregistraties voorkomen dubbele mails. Nieuwe automatische verzending pas na gecontroleerde omschakeling inschakelen.
- Toestelgoedkeuringen overnemen; door het gewijzigde webadres kan een toestel opnieuw aangemeld moeten worden. Geen ongecontroleerde automatische goedkeuring.

## Oplevercriterium
De verhuizing is pas klaar wanneer alle functies en aangeleverde gegevens gecontroleerd zijn en de laatste export is verwerkt. Ontbrekende bestanden, identiteitgegevens of niet-geteste functies worden expliciet gemeld; de exportcontrole alleen geldt niet als voltooide verhuizing.