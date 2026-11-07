# Roadmap

- [ ] Aankoopmails via boekhouding@riory.be verwerken, ontbrekende documenten herkennen en Peppol voorrang geven; automatische verwerking en tests controleren.

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
