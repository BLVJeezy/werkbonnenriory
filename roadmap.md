# Roadmap
- [x] Nieuwsbrieven: adminpagina met opgeslagen concepten, Riory-mailvoorbeeld/logo, emailgebonden toestemming/bewijs/historiek en persoonlijke uitschrijflink. Opslaan/herladen, anoniem uitschrijven en teruglezen getest met tijdelijke proefklant; zes regels getest, geen mails verstuurd.
- [ ] Nieuwsbrieven verzenden — gebruiker kiest voorlopig geen nieuwsbriefdienst; verzending blijft uitgeschakeld tot koppeling.
- [x] Facturen, creditnota’s en boekhouder-UBL via aparte boekhouding-mailbox; overige communicatie via info behouden. Afzendercontrole en mailcontact aangepast; 11 tests geslaagd en koppelknop als beheerder gecontroleerd.
- [ ] Boekhouding-mailbox koppelen en echte factuurverzending controleren — vereist Microsoft-aanmelding met boekhouding@riory.be en afgesproken proefontvanger.
- [x] Klant uitnodigen vanuit taak, kalender en taakdetail met standaardvakken ochtend 08:00–12:00 en namiddag 13:00–17:00 op vijf werkdagen; klant kiest via maillink en de bevestiging plant atomisch in de agenda. Keuzescherm, aanklikbare vakken en samenvatting gecontroleerd (24 tests geslaagd, build OK, geen consolefouten); overlappende kalenderkaarten hersteld. Geen echte klantmail verstuurd — uitnodigingsmail en klantbevestiging nog live te testen na publicatie.
- [x] Rioclean-tijdsvakken: native datumveld wist Belgische invoer; vervangen door tekstvelden voor ploeg en klantalternatieven. Echte Rioclean-link met twee tijdsvakken gecontroleerd tot correct genormaliseerd verstuurverzoek (geblokkeerd om echte mail te vermijden); 12 tests geslaagd, build OK. Publicatie en herladen nodig; fysieke Rioclean-telefoon en mailontvangst niet getest.
- [ ] Alleen aankoopfacturen verwijderen — verwijdering geweigerd; 22 aankoopfacturen blijven staan. 19 leveranciers behouden en terug zichtbaar; automatische aankoopimport gestopt.
- [x] Volledige taakomschrijving zichtbaar in takenlijst en als vaste volledige tekst in ploegdetail; lijst met bestaande omschrijvingen gecontroleerd zonder afkapping.
- [x] Aankoop voorlopig uit de navigatie gehaald; bestaande aankoopgegevens behouden. Als beheerder gecontroleerd dat Aankoop verborgen en Facturen bereikbaar is; build OK.
- [x] Simpla-verkoopfacturatiesync en overzicht uitgeschakeld; facturen uitsluitend in deze app, aankoopinlezing behouden. Geen oproep bij afronden, databasewachtrij gestopt; facturenpagina als beheerder gecontroleerd en 12 tests geslaagd.

- [x] Verslag bij facturen/creditnota's, offertes en werkbonnen, inclusief herinneringen; beveiligde link naast PDF, private exacte snapshot en tijdstippen zonder IP/cookies. GET telt niet; expliciete POST opent PDF; twee openingen en adminverslag teruggelezen, 35 tests geslaagd, proefgegevens verwijderd. Niet gelijk aan lezen/identiteit/aflevering; bestaande mails niet retroactief meetbaar.
- [x] Beveiligde gepagineerde verkoopfactuurfeed voor Mailtaken voorbereid, gedeeld token veilig opgeslagen; bevoegde toegang en anonieme weigering gecontroleerd. Implementatieoverdracht in .lovable/mailtaken-sales-integration.md.
- [ ] Mailtaken daadwerkelijk automatisch laten inlezen — alleen leesrechten vanuit deze chat; ontvangende import/bedrijfskeuze en hetzelfde gedeelde token moeten in Mailtaken-chat worden ingesteld. Publicatie van deze app vereist voor bronfeed en documentlinks; geen echte klantmail als proef verstuurd.

- [x] Aparte Contracten-pagina met bewerken/plannen, gecontroleerde factuurregels/kortingen/btw en expliciete automatische beurtfacturatie. Afronding maakt duurzame wachtrij; atomische unieke factuur met contractverwijzing; elke 5 minuten verwerking/verzending, onzekere verzending geblokkeerd. Adminbeheer, queue, eenmalige factuur/herverwerking, Facturen en PDF met 6%/21% gecontroleerd; tijdelijke gegevens verwijderd, geen mail verstuurd. Bestaande contractfacturatie staat uit tot bedragen per beurt bevestigd zijn.
- [ ] Echte automatische contractmail/ontvangst controleren — vereist publicatie van nieuwe verwerking en afgesproken proeffactuur; geen echte klantmail als test verstuurd.

- [x] Drie betalingsherinneringen met adminvoorbeeld/PDF, Belgische consumentenwachttijd en forfaits volgens artikel 11, expliciet klanttype en vooraf overeengekomen voorwaarden; geen interest/gestapelde kosten. Saldo minus betalingen/creditnota's, éénmalige verzendclaim en exacte historiek; 28 tests en adminvoorbeeld/PDF/herladen gecontroleerd. Geen echte herinnering verzonden.
- [ ] Echte ontvangst betalingsherinnering controleren — vereist afgesproken proefontvanger; juridische afdwingbaarheid per dossier blijft te beoordelen door jurist.

- [x] Offerteaanvragen verborgen uit Taken/Kalender via DB-gecontroleerde koppeling; proefomzetting en herladen getest. Nog in te plannen horizontaal met omschrijving, volledig adres en contact; screenshot gecontroleerd. Mailverplaatsing naar Uitgevoerd in duurzame, beveiligde wachtrij met stabiele ID/herproberen; 5 tests geslaagd.
- [ ] Afspraakmails daadwerkelijk naar Uitgevoerd verplaatsen — Microsoft vraagt nieuwe toestemming; gebruiker moet afspraak@riory.be opnieuw koppelen. 16 bestaande verwerkte afspraakmails wachten; geen echte mail verplaatst tijdens controle.

- [x] Negen gestarte contracten geïmporteerd, alle 16 oorspronkelijke regels en nummers bewaard, gekoppeld aan bestaande klanten; geen oude afspraken gegenereerd. Kalenderweergave en herladen gecontroleerd, 8 tests geslaagd. Planning pas na expliciete bevestiging van eerste beurt en ritme.

- [x] Werkbonnenpagina hernoemd naar Taken; nieuwe omzettingen naar offerte archiveren de brontaak atomisch en verdwijnen uit takenlijst en kalender. Omzetting en herladen met tijdelijke taak gecontroleerd; tests geslaagd, proefgegevens verwijderd.

- [x] Meerdere ploegvoorstellen en klantalternatieven bij afwijzing; ploeg kan alternatieven overnemen, klant kiest één tijdsvak dat atomisch in agenda komt. Volledige flow met twee voorstellen, afwijzing/twee alternatieven en tweede keuze na herladen getest; 7 tests geslaagd, proefdata verwijderd, geen echte mails verstuurd.

- [x] Externe ploeg: gekoppelde offerteomschrijving automatisch overgenomen zonder prijzen/kilometerpost; doorzetten zonder opnieuw typen, opgeslagen omschrijving en anonieme ploeglink gecontroleerd; 5 tests geslaagd, proefdata verwijderd, geen echte mail verstuurd.

- [x] Offerte-ondertekenlink hersteld: openbare bestemming in plaats van afgeschermde preview; openbaar online openen en anoniem ondertekenen/opslaan/herladen lokaal gecontroleerd, tijdelijke offerte verwijderd; 7 tests geslaagd en build OK. Nieuwe mailbestemming vereist publicatie en opnieuw versturen; geen echte klantmail verstuurd.

- [x] Externe zelfplannende ploegen zonder account: aanmaken, toegewezen taak doorzetten met prijsloze omschrijving, invullink datum/tijdsvak, klant bevestigt, atomische agendaplaatsing en bevestigingsmail naar ploeg. Ongeldige link, prijsloze pagina, voorstel/klantbevestiging/herladen/agenda en admin doorzetten/mailfout/herproberen getest met tijdelijke data; proefgegevens verwijderd, 3 tests geslaagd.
- [ ] Echte afspraakmails en ontvangst controleren — vereist afgesproken proefontvanger; geen echte klant- of ploegmail als test verstuurd. Nieuwe publieke links vereisen publicatie.

- [x] Excel-import: 2.975 unieke klanten uit 3.001 bronregels, 335 unieke projecten uit 337 bronregels, alle projecten gekoppeld; bestaande klanten op naam/volledig adres hergebruikt, codes/aliascodes behouden. Klantenkeuze toont alle 2.978 klanten; project/werfadreskeuze en herhaalde afspraakkoppeling getest, 7 tests geslaagd. Broncode 001475 hoort bij twee verschillende klanten en is bij beide behouden; geen willekeurige hernummering.

- [x] Mobiele OCR-scanner met camera, foto kiezen, draaien en controle vóór aankoopinlezing; cameraflow met proefbeeld en echte OCR gecontroleerd, camera stopt bij sluiten, foto-fallback getest, mobiele/desktopweergave gecontroleerd en proefgegevens verwijderd. Fysieke telefooncamera niet getest.

- [x] Leveranciers automatisch bewaren bij alle imports; betaalwijze, btw-regel en aftrekpercentage beheren. Kasticketten als foto/PDF inlezen met privé-origineel en duplicaatcontrole; foto/PDF, standaardkeuzes en herladen getest, 23 tests geslaagd, proefgegevens verwijderd.

- [x] Aankoopcontrole: originele PDF-upload met privé-opslag/voorbeeld, creditnota-keuze opgeslagen en herladen, Ponto-controle afgerond (0 matches); 23 tests geslaagd. Betaalbestand zet betaling klaar, niet betaald; aflettering op unieke banktransactie + bedrag/referentie.
- [ ] Originele aankoop-PDF automatisch uit Simpla ophalen (expliciet gevraagd) — leesgegevens en openbare documentatie onderzocht: originalFile bevat uitsluitend bestandsnamen, attachment leeg, help geeft NOK; geblokkeerd op Simpla's bevestigde PDF-downloadmethode. Bestaande facturen daarna aanvullen zonder bedragen/status te wijzigen.

- [x] Wachtwoordherstel voor beheerder: herstelknop en publieke pagina voor nieuw wachtwoord; formulier en toegelaten terugkeeradres gecontroleerd.

- [x] Simpla-token veilig ingesteld; bestaande Mailtaken-leescode en GET customer gecontroleerd (HTTP 200, OK).
- [x] Simpla-verkoopfacturatie op verzoek beëindigd: historische wachtrij behouden, geen nieuwe werkbonnen toegevoegd en geen herproberen meer. Facturen uitsluitend in deze app.

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

- [x] Aankoopfacturen: nieuwe pagina "Aankoop"; inlezen vanuit map "Aankoopfacturen" in info@riory.be (uurlijkse cron + knop "Nu inlezen"), PDF-tekst + AI leest leverancier, IBAN, nummer, datums, lijnen en bedragen uit; admin controleert met waarschuwingen bij afwijkingen, keurt goed en maakt één SEPA-betaalbestand (pain.001) dat elke factuur op zijn vervaldag betaalt; daarna status Betaald. 12 tests geslaagd, pagina in app geopend.
- [ ] Open: echte inlezing testen met een echte factuur-PDF in de map (vereist gekoppelde info@-mailbox); scans zonder tekstlaag worden nu geweigerd ("geen leesbare tekst").
- [ ] Uitgesteld: Peppol-ontvangst van aankoopfacturen — loopt nu via Simpla (offline); opnieuw bekijken zodra Simpla/OkiOki API-toegang geregeld is.

- [x] Taken: dag, ploeg en activiteit rechtstreeks in de lijst kiezen; dringende taken (uit mail of handmatig) met rood kader bovenaan en in de agenda.
- [x] Terugkerende opdrachten (contracten) in de agenda, elke N weken/maanden/jaren, 8 weken vooruit ingepland; contractwerkbonnen worden nooit gefactureerd.
- [ ] Automatische contractfacturatie — contractenlijst ontvangen, maar factuurritme en eerstvolgende factuurdatum ontbreken; vereist bevestiging door gebruiker.
