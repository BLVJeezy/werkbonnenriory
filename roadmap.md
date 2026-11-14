# Roadmap

- [x] Personeelsbudget: contracturen én geklokte uren uit geïntegreerde tikklok in Finance, gedeelde loonberekening en admin+bedrijfcontrole; bestaande loonbudgetposten blokkeren overnemen tegen dubbeltelling. Echte novemberraming op desktop/mobiel teruggelezen; geen budget of boekingen gewijzigd.

- [x] Fortis SEPA-export: ontbrekend verplicht DbtrAgt en ongeldige Belgische structured reference gereproduceerd en hersteld (BBA + 12 cijfers); BIC/datum/bedragvalidatie en unieke export-ID toegevoegd. 33 tests geslaagd; dezelfde XSD-controle faalt vóór en slaagt na herstel met/zonder BIC. Geen factuurstatus of betaling gewijzigd; origineel afgewezen bestand niet beschikbaar, bankacceptatie niet getest, niet gepubliceerd.

- [x] Dashboardweekcijfers: maand/weekkeuze, maandag-zondag, vorige/volgende week, volledige weekreeksen, omzet/kosten/resultaat/marge uit echte boekingsdatums en productomzet. 22 tests geslaagd; ingelogd week 45, navigatie, meerdere weken en uitsluiting lopende week gecontroleerd zonder JS-fouten. Niet gepubliceerd.

- [x] Dashboard: alleen afgesloten maanden in cijfers en productomzet; volledige afgesloten jaren in jaarvergelijking. 16 tests geslaagd; ingelogd oktober standaard, november/december leeg, toekomstige datum begrensd en historische periodekeuze gecontroleerd. Niet gepubliceerd.

- [x] Korting per offertelijn: percentage, nettoprijs en totalen, behoud bij bewerken, PDF en klantondertekening. 10 tests geslaagd; ingelogd €200 → €180 bij 10% gecontroleerd op bestaande offerte en kleiner scherm zonder opslaan/verzenden.

- [x] Hans Anders: oude unieke factuurverwijzing blokkeerde resterende €39 van één betaling van €288 na €249; vervangen door niet-unieke zoekindex. Unieke betalingsledger en factuurtoewijzingen behouden; fout exact gereproduceerd en 11 tests geslaagd. Geen bestaande aflettering of bankbetaling uitgevoerd.

- [x] Aankoopfactuur expliciet als al betaald aanduiden met betaaldatum en bevestiging op lijst en detail; uitsluiten van nieuwe betaalbestanden, zonder bankbetaling of bankboeking. 26 tests geslaagd; ingelogde bevestiging op desktop/kleiner scherm gecontroleerd, geen bestaande factuurstatus gewijzigd.

- [x] Gewijzigde leveranciersbetaalwijze vanuit factuurcontrole en leveranciersbeheer overnemen op andere gekoppelde open aankoopfacturen; betaalde en bankklaargezette facturen behouden. 31 tests geslaagd; ingelogd opslaan en teruglezen gecontroleerd zonder betaalwijze te wijzigen.

- [x] Ontbrekende kaartadressen bij Simpla-storing hersteld: privé laatste succesvolle adreslijst opgeslagen, projecten onafhankelijk geladen en Vernieuwen herlaadt alle bronnen. Ingelogd 3093 Simpla-adressen + 334 projectadressen, 3210 unieke locaties teruggelezen; 31 tests en automatische controle geslaagd. Geen Google-opzoekingen; kaartweergave zelf niet live getest, niet gepubliceerd.

- [x] Verzekeringsverslag-tab bij afgewerkte werkbonnen: bewerkbare AI-tekst uit techniekerbevindingen, bewaren, prijsloze PDF met foto's en expliciet verzenden via info@riory.be; echte AI-tekst, bewaren en PDF met drie foto's gecontroleerd, geen echte mail verzonden. Publicatie niet uitgevoerd.

- [x] SMS-knop "wij zijn onderweg" op de taakkaart zelf (Kalender én ploegweergave), vóór openen; panelen op neutrale witte achtergrond zodat ze leesbaar blijven op gekleurde ploegtaken. 10 tests, typecontrole en ingelogde desktopcontrole geslaagd; geen SMS verzonden.

- [x] Interne admin-interventiekaart gebouwd: 71 echte afgetekende werkbonnen op 63 genormaliseerde bestemmingen, menu, filters/lijst, clusters, werkbonlinks, privé locatiecache en optionele begrensde geocoder. 27 tests en automatische type-/buildcontrole geslaagd; ingelogde echte-bronnencheck desktop/mobiel en werkbonlink zonder JS-fouten. Geen Simpla-adressen, datawijzigingen of externe adresopzoekingen.
- [ ] Interventiepinnen vullen: alle 63 locaties missen opgeslagen coördinaten; wacht op handmatig bevestigde coördinaten of goedgekeurde adreszoekdienst met dagbudget. Pin/popover-flow met echte opgeslagen locatie nog niet uitvoerbaar zonder broncoördinaten. Echte oudere werkbonnen vóór 27 oktober 2026 niet beschikbaar; vereist daadwerkelijk interventiearchief. Publicatie nog niet uitgevoerd.
- [x] Verduidelijking: alle beschikbare adressen op uitgevoerde werkbonnen als bron, met werfadres waar aangeduid; geen factuurhistoriek als fictieve interventies.

- [x] Historische Simpla-productomzet hersteld: werkelijke lees-API en token bevestigd (2918 verkoopfacturen, 104 creditnota’s); factuurdatum/netto-kortingen, bron+nummerdeduplicatie met appvoorrang, aankoopfouten afzonderlijk, herkomst en niet-herkende productregels zichtbaar. 18 tests/typecontrole/build en ingelogde echte-bronnencontrole geslaagd; niets geïmporteerd/geboekt. Ambigue 110–200mm-camera’s niet gegokt bij 125–250. Publicatie en GitHub-syncstatus niet bevestigd.

- [x] Niko's bestaande live link behoudt token en toont nu 08:00–12:00 en 13:00–16:00 voor dinsdag/maandag; vrijdag behouden. Dinsdagnamiddag mobiel selecteerbaar en bevestigingsknop actief, niets namens klant bevestigd. Nieuwe ploegvoorstellen worden bij opslaan gesplitst; bevestigingsmail gebruikt exacte gekozen uren. Vijftien tests geslaagd; nieuwe automatische splitsing/mailtekst vereist publicatie, bestaande live link al aangepast.

- [x] Voorgestelde tijdsloten onderaannemer zichtbaar in Kalender en taakdetail, inclusief klantalternatieven en bevestigingsstatus. Drie echte Rioclean-voorstellen teruggelezen in beide schermen, mobiel zonder overflow; twaalf bestaande afspraaktests geslaagd. Geen afspraak of mail gewijzigd.

- [x] Mobiele werknemerstoegang uitgelegd: /tikklok, toestelgoedkeuring door admin en bestaande PIN. Riory-kleuren hersteld in lichte/donkere modus, mobiele kop aangepast; beheer en toegangspoort zonder horizontale overflow gecontroleerd. Oude tikklok blijft actief tot goedgekeurde omschakeling.

- [x] Nieuwe beheerders aanmaken of uitnodigen vanuit Instellingen; alleen bestaande beheerders kunnen rollen toekennen. Uitnodiging delen/kopiëren, eigen wachtwoord en eenmalige link getest; zes tests geslaagd, mobiele weergave gecontroleerd en tijdelijk testaccount verwijderd. Handleiding bijgewerkt; publiceren nodig voor de publieke uitnodigingspagina.

- [x] Takenbeheer samengebracht in Kalender: aanmaken, mailinstroom naar Nog in te plannen, snel dag/ploeg/activiteit kiezen en offerteknop; oude URL verwijst door, beperkte ploegweergave behouden. 22 tests en ingelogde desktop-/mobiele planning met teruglezen geslaagd; tijdelijke controletaak verwijderd. Dagelijkse mailboxcontrole om 05:00 UTC ingesteld (06:00 wintertijd / 07:00 zomertijd, maximaal een dag vertraging zonder geopende kalender), plus vijfminutencontrole zolang Kalender openstaat; dagelijkse uitvoering wacht op publicatie. Offerteknop zichtbaar gecontroleerd, geen echte offerte aangemaakt.

- [x] Klantnaam en opgesplitst adres automatisch via VIES bij BE-/NL-btw-nummer (Belgisch nummer ook zonder BE); bestaande gegevens en syndicus gescheiden behouden. Zeven tests en ingelogde Nederlandse aanvulling geslaagd; Belgische dienst tijdelijk bezet, foutmelding gecontroleerd. Niet-btw-plichtige ondernemingen/VME’s blijven handmatig.

- [x] Alleen Riory in Dashboard, Boekhouding en Finance; Syncro19-import/pagina geannuleerd, bedrijf toevoegen verwijderd, nieuw opgeslagen exportbestanden verwijderd. Vijf tests en drie ingelogde schermcontroles geslaagd. Bestaande Syncro19-boekhoudgegevens behouden buiten de schermen; geen factuurimport uitgevoerd.
- [ ] OkiOki-gegevens ophalen: wacht op een ondersteunde export- of ontvangstmethode; geen publieke API bevestigd, factuurverzending via Peppyrus behouden.

- [x] DKV: 17 bewezen dubbele deelstukken verwijderd met auditkopieën; 12 dubbele kostenboekingen tegengeboekt en vier uitleesbedragen gecorrigeerd. Kostenverlaging €4.301,45; alle correctieboekingen in evenwicht, bankbetalingen ongewijzigd.
- [x] Zeven aangeleverde DKV-afrekeningen gecontroleerd: april €499,18 (waarborg €135 op 288000), eind april €87,43, 26 mei €0,01, eind mei €77,90, 15 juni €280,60, eind juni €233,29, 15 juli €204,95. Deelstukken samengevoegd; bestaande bankboekingen behouden en koppelingen bevestigd.
- [x] DKV geconsolideerd tot 16 afrekeningen voor €6.769,00; €135 waarborg apart, kosten €6.634,00. Vijftien bestaande betalingen bevestigd; september/oktober van wachtrekening naar leveranciers, laatste afrekening €807,69 open. Twee uploads 15 oktober tellen één keer; Peppol-deelfactuur ongewijzigd zonder dubbele kostenboeking.
- [ ] DKV origineel totaalbestand van 31 maart nog niet aangeleverd; bestaand bedrag €302,58 is gelijk aan bankbetaling en behouden. Peppol-deelfactuur €716,93 blijft zichtbaar als los betalingskeuze-item naast afrekening €807,69; geen tweede boeking, maar structurele documentgroepering ontbreekt.

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

- [x] Riostopkost van IDBS bij de dashboardtegel Riostoppen/inspectiepunten; 10 tests geslaagd en ingelogde controle (Kost IDBS €900,00, marge €3.940,00 over 2023-2026).

- [ ] Tikklok volledig verhuizen (geen dataverlies): 25 aparte tabellen en native beheer-/tabletschermen gebouwd; 369 exportregels atomisch geïmporteerd en volledig vergeleken (5 medewerkers, 177 klokregistraties, 13 loonberekeningen, contract met beide handtekeningen). 38 tests geslaagd; Overdracht-tab bevat PIN- en mailafzendercontroles. Mailafzendercheck geeft Outlook 401 en nieuwe telling blijft op Controleren; nog te herstellen/valideren. Oude tikklok blijft actief; nieuwe bereikbaar via Medewerkers → Nieuwe tikklok controleren. Nog nodig: bestaand medewerkers-PIN testen, sociaal-secretariaatveld dat exportfilter wegliet veilig aanvullen, bronbeheerdersidentiteit en privébestandsinventaris, daadwerkelijke mailafzender/planningen controleren, laatste aanvullings-export en expliciete omschakelgoedkeuring. Automatische mails bewust uitgeschakeld.
