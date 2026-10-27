# Roadmap

- [x] Projectnaam uit mail mee uitlezen, op klant en taak, selecteerbaar bij inplannen (datalist)
- [x] Offerteruimte: offertes maken (OFF-nummering), versturen met ondertekenlink, digitale handtekening op publieke pagina, na akkoord omzetten in taak — volledig getest in de app (proefofferte OFF-1 ondertekend en omgezet, daarna opgeruimd)
- [x] Producten markeren als enkel-voor-admin; ploegen zien ze niet (RLS + interface)
- [x] Creditnota's vanaf bestaande factuur, negatieve bedragen, zelfde factuurnummering, eigen PDF/UBL (type 381) — aangemaakt in de app en proefcreditnota opgeruimd
- [x] Knop "Alles naar boekhouder (UBL)": alle facturen/creditnota's als UBL-bijlagen in één mail naar peter@trivisio.be (instelbaar)
- [ ] Echte offertemail en boekhoudermail controleren — vereist gekoppelde info-mailbox; geen echte mails verstuurd



- [x] Knop ‘Geselecteerde verwijderen’ bij ‘Te factureren’, met bevestiging; vier tests geslaagd en annuleren/verwijderen/herladen gecontroleerd op tijdelijke proefbon.

- [x] Factuur-PDF naar klant en voor bedrijven (ingevuld btw-nummer) aparte UBL-mail naar OkiOki; automatisch alleen volledig betaald; afzonderlijke mailstatussen en verzendlock. 11 tests geslaagd, facturenpagina als beheerder en opslagvelden gecontroleerd.
- [ ] Echte factuurontvangst en Peppol-aflevering via OkiOki controleren — vereist goedgekeurde proeffactuur en OkiOki Smart met automatische UBL-verzending; geen echte factuur verstuurd.

- [x] Admin ziet lopende taken met starttijd en Bezig-filter; lijst en kalender verversen automatisch iedere 10 seconden. Start/stop op aparte pagina gecontroleerd en tijdelijke taak verwijderd.

- [x] Prijsloze werkbon als pdf-bijlage in plaats van mailtekst; pdf-structuur, pagina's en Outlook-bijlage getest, voorbeeld-pdf gecontroleerd
- [ ] Echte ontvangst van pdf-bijlage controleren — vereist gekoppelde info-mailbox en een goedgekeurde testontvanger; geen klantmail als proef verstuurd

- [x] Btw-nummer toegevoegd aan mailuitlezing en taak; aanmaken/bewerken/herladen in app gecontroleerd
- [x] Na aftekenen of afrekenen terug naar beginscherm voor ploegen; beide paden en mailfout getest
- [ ] Echte mailimport met btw-nummer controleren — vereist een geschikte nieuwe mail
- [ ] Terugkeer in ploegsessie end-to-end controleren — huidige testsessie is beheerder; ploegaanmelding nodig

- [x] Werkbonmail zonder prijzen of betaalbedragen
- [x] Apart aanvinkbaar werfadres bij aanmaken/bewerken en mailimport; gebruiken voor route en kilometers
- [x] Tests en controle in de app (aanmaken, bewerken, herladen en route gecontroleerd)
- [ ] Echte mailimport met werfadres en ontvangst van prijsloze werkbonmail controleren — vereist een geschikte nieuwe mailboxmail en gekoppelde verzendmailbox; geen klantmail als proef verstuurd.

- [x] Werkbon automatisch mailen naar klant na aftekenen/afrekenen, vanuit info@riory.be
  - [x] Serverfunctie sendWerkbonEmail (verstuurt via Microsoft-koppeling)
  - [x] Aparte mailboxkoppeling info@riory.be (zelfde flow als afspraak@riory.be), afzender voor werkbonmail
  - [x] Automatische verzending gekoppeld aan aftekenen + afrekenen in detailpagina
  - [x] Manuele knop "Mail naar klant" op afgetekende werkbon
  - [ ] Open: beheerder moet info@riory.be eenmalig koppelen via de knop op de Werkbonnen-pagina (vereist Microsoft-aanmelding van de gebruiker)
- [x] (afgezegd door gebruiker) Afzenderdomein/Lovable-e-mail — niet doen

- [x] Automatisch afpunten via Ponto: client ID/secret versleuteld in instellingen, uurlijkse controle (cron) + knop "Betalingen controleren" op Facturen; match op bedrag + factuurnummer in mededeling; factuur krijgt Betaald-badge met datum. 7 matchtests geslaagd, typecheck en build OK.
- [ ] Open: beheerder moet in het Ponto-dashboard een eigen integratie aanmaken (scope rekeninginformatie + bankrekening) en client ID/secret in de app plakken; echte betalingsmatching daarna met een echte betaling controleren — nog niet getest.

- [ ] (uitgesteld door gebruiker, 27 okt 2026) Mailtaken-app (Mail Assist AI) samenvoegen in Riory Werkbonnen — beide apps blijven voorlopig apart

- [x] Taak omzetten naar offerte: knop op taakpagina (admin), offerte opent meteen ter aanvulling op Offertes; offertes bewerkbaar tot ondertekening; bij opslaan opent afdrukvoorbeeld in nieuw tabblad; PDF vernieuwd (klantpaneel, Betreft-blok, Riory-huisstijl). In de app getest met proefofferte OFF-2 (daarna opgeruimd); typecheck, 74 tests en build OK.
