# Roadmap

- [x] Facturen kiezen bij wachtrekening, met atomische herclassificatie en behoud van open restbedragen; oorspronkelijke bankboeking blijft behouden.

- [x] Eurokorting automatisch uit testbon gelezen; bedrag aangepast, opgeslagen en teruggelezen; percentage en mobiel gecontroleerd. Testdocument verwijderd.
- [x] 23 ongecontroleerde oude mailfacturen verwijderd; scans, Peppol en boekingen behouden. Oude gepubliceerde mailcontrole stopgezet.
- [ ] Automatische mailcontrole opnieuw instellen na publicatie van de vaste startdatum; wacht op publicatie. Handmatige previewimport blijft beschikbaar, Peppol-controle actief.

- [x] Zeven oude mailfacturen verwijderd; mailstart vast op 7 november 2026 Belgische middernacht. Factuurdatums zichtbaar; negen tests geslaagd en ingelogde herimport haalt geen oude berichten op.

- [x] Dubbele boekingsreferentie bij verdere deelaflettering hersteld; oude botsing en nieuwe unieke referenties ingelogd gecontroleerd, zes verdeeltests geslaagd. Geen echte aflettering uitgevoerd.

- [x] Aankoopmails via boekhouding@riory.be met Peppol-voorrang, atomische deduplicatie en kwartiercontrole; negen tests en ingelogde ontvangst gecontroleerd. Publicatie nodig voor automatische nieuwe verwerking.
- [ ] BNP-factuur van €1,45: niet gevonden in app, bankverrichtingen of Simpla; wacht op factuurnummer, datum of origineel document. Geen betaling uitgevoerd.

- [x] Alleen toegewezen bankbedragen verwerken; restant openhouden en verder in delen afletteren. Twintig tests geslaagd; ingelogde keuze toont verdere deelbedragen zonder nieuwe echte aflettering.
- [x] Laatst afgeletterde Lovable-betaling gecorrigeerd: BNP €1,09 betaald, €90 open; oorspronkelijke €91,09 behouden en deelboeking in evenwicht.

- [x] Fout bij afletteren hersteld: actieve centralisatierekeningen van het bedrijf gebruiken bij verdelen, handmatig koppelen en aankoopkoppeling; geen betalingen of boekingen uitgevoerd.

- [x] Eén betaling over meerdere facturen verdelen; €75,91 = Lovable €75 + BNP €0,91 zichtbaar gecontroleerd, elf tests geslaagd. Geen echte aflettering uitgevoerd.

- [x] Afletterlabels per factuur in de bankkeuzelijst; beide statussen zichtbaar gecontroleerd en acht tests geslaagd.

- [x] Aankoopfacturen uit de app zichtbaar bij bankverrichtingen; Littera 2603032 gevonden en geselecteerd, 20 tests geslaagd. Geen echte betaling gekoppeld.

- [x] Vrije factuurkeuze bij bankverrichtingen en veilige koppeling van terugstortingen; 14 tests en zes ingelogde controles van de betaalregels geslaagd. Geen echte boeking uitgevoerd.

- [x] Peppol automatisch ophalen elke vijf minuten; beveiligde controle en handmatige import getest, unieke bericht-ID's bevestigd. Nieuwe ontvangstcode moet nog gepubliceerd worden voor de ingestelde achtergrondcontrole.

- [x] IBAN en BIC automatisch uitlezen bij scans, uploads en aankoopmails; ontbrekende BIC uit bekende bankcodes afleiden en bewaren (36 tests geslaagd; echte scan nog niet getest).

- [x] Creditnota 20260847 als betaald gemarkeerd (boekt factuur 20260842 af)
- [x] Factuur 20260842 als betaald gemarkeerd
