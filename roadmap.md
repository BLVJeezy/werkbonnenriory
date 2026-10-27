# Roadmap

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
