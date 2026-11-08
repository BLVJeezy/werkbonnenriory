// Alle processen van de app: bron voor de stroomschema's, de uitgebreide handleiding,
// de ploeghandleiding en de inschakelbare hulp per scherm. Bij elke functionele wijziging mee aanpassen.
export const HANDLEIDING_VERSIE = "8 november 2026";

export type Doelgroep = "admin" | "ploeg";
export type Stap = { titel: string; uitleg?: string; keuze?: string[] };
export type Proces = {
  id: string;
  titel: string;
  doelgroep: Doelgroep;
  schermen: string[]; // paden waar de hulp verschijnt
  doel: string;
  stappen: Stap[];
  details: string[]; // uitgebreide handleiding: elk detail
  letOp?: string[];
};

export const processen: Proces[] = [
  // ───────────── BEHEERDER ─────────────
  {
    id: "aanmelden-admin", titel: "Aanmelden en startscherm", doelgroep: "admin", schermen: ["/dashboard"],
    doel: "Veilig aanmelden en meteen de cijfers zien.",
    stappen: [
      { titel: "Aanmeldscherm", uitleg: "E-mail + wachtwoord" },
      { titel: "Wachtwoord vergeten?", keuze: ["Ja → herstelmail → nieuw wachtwoord", "Nee → aanmelden"] },
      { titel: "Dashboard", uitleg: "Omzet, kosten, marge" },
    ],
    details: [
      "De beheerder meldt aan met het eigen e-mailadres en wachtwoord. Publiek registreren is uitgeschakeld; nieuwe logins maakt alleen een bestaande beheerder.",
      "'Wachtwoord vergeten' stuurt een herstelmail; de link opent de pagina om een nieuw wachtwoord te kiezen. Wachtwoorden worden nooit getoond.",
      "Na aanmelden opent het Dashboard: jaarcijfers (omzet, kosten, resultaat, marge, vergelijking met vorige jaren), omzet per dag of maand en omzet per product.",
      "Kies bovenaan Van en Tot. Omzet telt op de werkdag van de werkbon (geplande datum, anders aftekendatum). Zelf gemaakte facturen zonder werkbon tellen op hun factuurdatum; creditnota's trekken af; 'Niet factureren' telt niet mee.",
      "Omzet per product: camera-inspectie 32-50, 75-110 en 125-250 apart, ledigen septische put, reiniging regenputten, riostoppen/inspectiepunten. Simpla-facturen van vóór de eerste werkbon in de app tellen mee (alleen gelezen).",
      "Bij regenputten staat de kost van Rioclean en de marge; bij septische putten de kost van alle leveranciers die septische putten factureren.",
    ],
  },
  {
    id: "beheerders", titel: "Een beheerder aanmaken of uitnodigen", doelgroep: "admin", schermen: ["/instellingen"],
    doel: "Een collega volledige beheertoegang geven met een eigen account.",
    stappen: [
      { titel: "Instellingen → Beheerders" },
      { titel: "Kies aanmaken of uitnodigen", keuze: ["Zelf aanmaken → e-mailadres en wachtwoord", "Uitnodigen → e-mailadres en persoonlijke link"] },
      { titel: "Deel de uitnodiging", uitleg: "Delen of kopiëren naar mail/bericht" },
      { titel: "Nieuwe beheerder opent de link", uitleg: "Uitnodiging openen, eigen wachtwoord kiezen" },
      { titel: "Aanmelden", uitleg: "Eigen e-mailadres en wachtwoord → Dashboard" },
    ],
    details: [
      "Alleen een bestaande beheerder kan een nieuw beheerderaccount maken. Het e-mailadres mag nog niet voor een ander account gebruikt zijn.",
      "Uitnodigen maakt het account en toont een persoonlijk bericht. Er wordt niet automatisch een mail verstuurd: gebruik Delen of Kopiëren en stuur het bericht zelf door.",
      "De persoonlijke link is eenmalig en kan verlopen. De ontvanger klikt Uitnodiging openen en kiest tweemaal hetzelfde wachtwoord van minstens acht tekens.",
      "Zelf aanmaken vraagt het e-mailadres en een wachtwoord. Het nieuwe account kan daarmee meteen aanmelden; wachtwoorden worden nadien nooit getoond.",
      "De lijst toont wie al aangemeld heeft. Met Uitnodigingslink bij een andere beheerder maak je een nieuwe wachtwoordlink; deel die alleen met die persoon.",
    ],
    letOp: ["Een beheerder krijgt volledige toegang, ook tot facturen, boekhouding en accountbeheer.", "Uitnodigingslinks zijn vertrouwelijk: deel ze uitsluitend met de bedoelde ontvanger."],
  },
  {
    id: "mailimport", titel: "Nieuwe opdrachten uit de mailbox", doelgroep: "admin", schermen: ["/kalender"],
    doel: "Elke aanvraag in afspraak@riory.be wordt automatisch een taak.",
    stappen: [
      { titel: "Mail komt binnen", uitleg: "afspraak@riory.be" },
      { titel: "AI leest de mail", uitleg: "Klant, adres, telefoon, e-mail, btw, omschrijving" },
      { titel: "Soort aanvraag?", keuze: ["Syndicus → VME is klant, werfadres = facturatieadres", "Particulier/bedrijf → gewone klant", "'Vrij beroep' in mail → altijd 21%"] },
      { titel: "Klant gekoppeld", uitleg: "Bestaand (naam + adres) of nieuw" },
      { titel: "Nog in te plannen", uitleg: "Status nieuw, geen ploeg" },
    ],
    details: [
      "De mailbox wordt elke dag om 06:00 (Belgische tijd) gelezen en elke vijf minuten zolang de Kalender openstaat. Per keer maximaal 15 nieuwe mails.",
      "Een mail die al eens ingelezen werd, wordt herkend (ook als Outlook ze een ander kenmerk geeft) en komt niet dubbel binnen.",
      "Adressen worden opgesplitst in straat, nr., postcode en plaats. Een apart werfadres wordt aangevinkt als het verschilt.",
      "Btw wordt automatisch voorgesteld: BE/NL-btw-nummer → 0% verlegd; Nederlandse particulier → 21%; Belgische woning ouder dan 10 jaar → 6%; anders 21%.",
      "Bij een syndicusmail wordt de VME de klant; de syndicus (naam, e-mails, telefoon) wordt extra informatie op de klantfiche. Het btw-nummer van de syndicus komt niet bij de VME.",
      "Dringende mails krijgen automatisch het label Dringend.",
      "Verwerkte mails worden in Outlook naar de map Uitgevoerd verplaatst.",
    ],
    letOp: ["De dagelijkse import werkt alleen in de gepubliceerde app.", "Is de mailbox-koppeling verlopen, klik 'Mailbox opnieuw koppelen'."],
  },
  {
    id: "inplannen", titel: "Taken inplannen in de Kalender", doelgroep: "admin", schermen: ["/kalender"],
    doel: "Elke taak een dag, ploeg en activiteit geven.",
    stappen: [
      { titel: "Nog in te plannen", uitleg: "Kaarten bovenaan" },
      { titel: "Kies dag, ploeg, activiteit", uitleg: "Snelkeuze op de kaart" },
      { titel: "Extra labels?", keuze: ["Dringend (knop op kaart)", "Eerste klant 08:00–09:00", "Niets"] },
      { titel: "Ingepland", uitleg: "Ploeg ziet de taak vandaag/morgen" },
    ],
    details: [
      "De Kalender toont gisteren, vandaag en minstens zeven dagen vooruit. Taken kan je zoeken, sorteren en per ploeg bekijken.",
      "Nieuwe taak handmatig: knop Nieuwe taak, klant kiezen of aanmaken, omschrijving, adres en eventueel werfadres en contactpersoon.",
      "De activiteit bepaalt het uurtarief. Arbeid: eerste uur volledig, daarna per begonnen kwartier.",
      "Kilometers worden berekend heen en terug vanaf de dichtstbijzijnde vestiging (standaard Natveld 47, 3740 Bilzen) tegen een vast bedrag per km.",
      "Garantie-vinkje: eerste uur en kilometers worden niet aangerekend, materialen wel.",
      "'Eerste klant' zet de afspraak eerst in de dag; ploeg en admin zien het label.",
      "Ploegen zien enkel taken van vandaag, morgen en nog in te plannen die aan hen toegewezen zijn.",
      "Meerdere taken selecteren en verwijderen kan met één bevestiging.",
    ],
  },
  {
    id: "offerte-uit-taak", titel: "Taak omzetten naar offerte", doelgroep: "admin", schermen: ["/kalender", "/offertes"],
    doel: "Werk dat eerst een prijs nodig heeft, wacht op akkoord van de klant.",
    stappen: [
      { titel: "Taak in Nog in te plannen" },
      { titel: "Omzetten naar offerte", uitleg: "Offerte wordt aangemaakt" },
      { titel: "Taak verdwijnt", uitleg: "Uit de kalender tot akkoord" },
      { titel: "Klant tekent?", keuze: ["Ja → taak komt terug met 'Offerte goedgekeurd'", "Nee → herinneringen dag 7 en 10, daarna bellen"] },
    ],
    details: [
      "De offerte neemt klant, adres, werfadres en ploeg van de taak over.",
      "Zolang de klant niet akkoord is, staat de taak niet bij Nog in te plannen of in de planning.",
      "Na ondertekening maakt de app precies één taak aan (nooit dubbel) met het label Offerte goedgekeurd.",
      "Bij offertes met opties staat in de taak duidelijk UIT TE VOEREN en NIET GEKOZEN DOOR KLANT — NIET UITVOEREN.",
    ],
  },
  {
    id: "offerte", titel: "Offerte opmaken, verzenden en laten tekenen", doelgroep: "admin", schermen: ["/offertes"],
    doel: "Professionele offerte die de klant online ondertekent.",
    stappen: [
      { titel: "Nieuwe offerte", uitleg: "Nummer OFF-…" },
      { titel: "Lijnen toevoegen", uitleg: "Producten, titels, optionele regels, foto's" },
      { titel: "Voorbeeld bekijken" },
      { titel: "Verzenden", uitleg: "Mail vanuit info@riory.be met tekenlink" },
      { titel: "Klant kiest opties en tekent" },
      { titel: "Akkoord", uitleg: "Taak in Kalender" },
    ],
    details: [
      "Producten zoek je met de zoekbalk; productfoto's gaan automatisch mee in de offerte.",
      "Titels groeperen lijnen. Optionele regels kan de klant aan- of uitvinken; niet-gekozen opties worden vaag getoond.",
      "Productnaam staat vet, de lange omschrijving eronder als bijvoegsel.",
      "Kilometers kunnen automatisch toegevoegd worden (heen en terug).",
      "Voorwaarden bevatten o.a. 'onder voorbehoud van ondergrond'.",
      "De tekenlink gebruikt altijd het publieke adres van de app, zodat de klant ze kan openen.",
      "Herinneringen gaan na 7 en 10 dagen; daarna raadt de app aan te bellen.",
      "Je ziet wanneer de offertemail en de link geopend werden (openen betekent niet gelezen).",
    ],
  },
  {
    id: "verzekering", titel: "Verzekeringsverslag en bestek", doelgroep: "admin", schermen: ["/offertes", "/afgewerkte-werkbonnen"],
    doel: "Prijsloos verslag voor de verzekering en een apart bestek.",
    stappen: [
      { titel: "Afgewerkte werkbon" },
      { titel: "Bestek maken", uitleg: "Werkbon blijft bestaan" },
      { titel: "Foto's kiezen", uitleg: "Als bijlage vóór de voorwaarden" },
      { titel: "AI-voorstel tekst", uitleg: "Zonder prijzen, nog niet bewaard" },
      { titel: "Verzenden" },
    ],
    details: [
      "Het verslag bevat geen prijzen; het bestek heeft instelbare titels en vaste producten.",
      "Een bestek gebruikt dezelfde nummering en tekenflow als een offerte.",
      "De bronwerkbon wordt niet gearchiveerd of verborgen.",
    ],
  },
  {
    id: "contracten", titel: "Contracten (periodiek onderhoud)", doelgroep: "admin", schermen: ["/contracten"],
    doel: "Terugkerende bezoeken automatisch plannen en factureren.",
    stappen: [
      { titel: "Contract aanmaken", uitleg: "Klant, frequentie, lijnen" },
      { titel: "Activeren", uitleg: "Bewuste keuze" },
      { titel: "Bezoek uitgevoerd", uitleg: "Werkbon afgetekend" },
      { titel: "Soort bon?", keuze: ["Gewoon → factuurlijn per bezoek", "Informatief → niet gefactureerd"] },
      { titel: "Factuur", uitleg: "Elke 5 minuten verwerkt" },
    ],
    details: [
      "Alleen gestarte contracten werden overgenomen.",
      "Elk bevestigd bezoek komt maar één keer in de factuurwachtrij.",
      "Is een mail onzeker verzonden, dan probeert de app niet opnieuw; controleer handmatig.",
    ],
  },
  {
    id: "klanten", titel: "Klanten, projecten en contactpersonen", doelgroep: "admin", schermen: ["/klanten"],
    doel: "Eén juiste fiche per klant.",
    stappen: [
      { titel: "Klant zoeken", uitleg: "Nieuwste eerst" },
      { titel: "Bestaat?", keuze: ["Ja → fiche openen", "Nee → nieuwe klant"] },
      { titel: "Btw/ondernemingsnummer invullen", uitleg: "Naam en adres automatisch" },
      { titel: "Contactpersonen, projecten, syndicus" },
      { titel: "Opslaan" },
    ],
    details: [
      "Klanten worden herkend op naam en volledig adres; klantcodes blijven behouden.",
      "Automatisch aanvullen werkt voor BE/NL-btw-nummers en Belgische ondernemingsnummers en vult enkel lege velden.",
      "Contactpersonen (bv. bij een VME) kies je later bij een taak zodat de juiste persoon gebeld wordt.",
      "Projecten horen bij een klant.",
      "Klanten kunnen een vestigingslabel krijgen; Maastricht gebruikt Nederlandse facturatieregels.",
      "Alle klanten zijn standaard ingeschreven op de nieuwsbrief tenzij uitgeschreven.",
    ],
  },
  {
    id: "syndici", titel: "Syndici en VME's", doelgroep: "admin", schermen: ["/syndici", "/klanten"],
    doel: "Weten welke VME bij welke syndicus hoort.",
    stappen: [
      { titel: "Syndicusfiche", uitleg: "Naam, btw, adres, telefoon, e-mails" },
      { titel: "VME's toewijzen", uitleg: "Ook in bulk" },
      { titel: "Bij nieuwe VME syndicus kiezen", uitleg: "Gegevens worden ingevuld" },
      { titel: "Factuur", uitleg: "Aan VME op werfadres" },
    ],
    details: [
      "De pagina Syndici toont kaarten per syndicus met een ingeklapte lijst residenties; Alles uitklappen/inklappen.",
      "Bij een lege VME-e-mail wordt het gewone syndicus-e-mailadres het contactadres en het boekhoudadres het facturatieadres.",
      "Het btw-nummer van de syndicus hoort nooit bij de VME.",
    ],
  },
  {
    id: "ploegen", titel: "Ploegen aanmaken en uitnodigen", doelgroep: "admin", schermen: ["/instellingen"],
    doel: "Elke ploeg veilig toegang geven met juiste rechten.",
    stappen: [
      { titel: "Ploeg aanmaken", uitleg: "Naam, kleur" },
      { titel: "Rechten kiezen", uitleg: "Prijzen, klantgegevens, afrekenen, afgetekende bonnen, manuele tijd" },
      { titel: "Uitnodigen via WhatsApp" },
      { titel: "Ploeg kiest wachtwoord", uitleg: "Link 72 uur geldig, één keer" },
      { titel: "Ploeg meldt aan", uitleg: "Ploegnaam + wachtwoord" },
    ],
    details: [
      "Er wordt nooit een wachtwoord via WhatsApp gestuurd.",
      "Externe ploegen kunnen zelf afspraken plannen: ze stellen datum en tijdsvak voor, de klant bevestigt. Ze zien geen prijzen of offertes.",
      "Rollen: beheerder, technieker (ploeg) en marketing (enkel klanten, nieuwsbrieven en foto's).",
    ],
  },
  {
    id: "producten", titel: "Producten en prijzen", doelgroep: "admin", schermen: ["/producten"],
    doel: "Eén productlijst voor werkbonnen, offertes en facturen.",
    stappen: [
      { titel: "Product toevoegen", uitleg: "Naam, prijs, eenheid, foto" },
      { titel: "Zichtbaarheid", keuze: ["Alleen admin", "Ook voor ploegen"] },
      { titel: "Gebruikt in werkbon/offerte/factuur" },
    ],
    details: ["De volledige productlijst is alleen voor de admin; de zes ploegproducten blijven zichtbaar voor ploegen."],
  },
  {
    id: "factureren", titel: "Werkbonnen factureren", doelgroep: "admin", schermen: ["/facturen", "/afgewerkte-werkbonnen"],
    doel: "Afgewerkte werkbonnen snel en correct factureren.",
    stappen: [
      { titel: "Te factureren", uitleg: "Afgewerkte werkbonnen" },
      { titel: "Selecteren", keuze: ["Factureren → één factuur per klant en btw-tarief", "Niet factureren → apart lijstje, terugzetbaar"] },
      { titel: "Factuur controleren", uitleg: "Aanpasbaar tot verzonden" },
      { titel: "Verzenden" },
    ],
    details: [
      "Werkbonnen van dezelfde klant komen samen op één factuur, elke werkbon als aparte groep.",
      "Reeds afgerekende bonnen tonen 'reeds betaald'; het resterende saldo staat onderaan.",
      "Titels groeperen producten met subtotaal; per titel kies je of productprijzen verborgen zijn.",
      "Factuurnummers worden in één stap toegekend: er ontstaan nooit gaten.",
      "Elke factuur krijgt een Belgische gestructureerde mededeling en een betaal-QR-code.",
      "Verplichte btw-vermeldingen bij 6% en verlegging worden automatisch toegevoegd.",
      "Zelf een factuur maken kan ook, met kilometers en activiteit per lijn.",
    ],
  },
  {
    id: "factuur-verzenden", titel: "Factuur verzenden", doelgroep: "admin", schermen: ["/facturen"],
    doel: "Factuur bij de klant krijgen via de juiste weg.",
    stappen: [
      { titel: "Verzenden" },
      { titel: "Klant met Belgisch btw-nummer?", keuze: ["Ja → ook via Peppol (Peppyrus)", "Nee → enkel mail"] },
      { titel: "Mail vanuit boekhouding@riory.be", uitleg: "PDF + UBL" },
      { titel: "Opvolgen", uitleg: "Geopend? Betaald?" },
      { titel: "Of per post", uitleg: "Knop bpost" },
    ],
    details: [
      "Adres: facturatiemail van de werkbon → facturatiemail van de klant → algemeen adres.",
      "Betaalde facturen worden automatisch verzonden; openstaande verstuur je zelf.",
      "De mail vraagt een leesbevestiging en meet openen; dat bewijst niet dat de klant gelezen heeft.",
      "Er gaat geen kopie meer naar OkiOki.",
      "'Kopie mailen' stuurt een factuur opnieuw naar het juiste adres.",
    ],
  },
  {
    id: "herinneringen", titel: "Betalingsherinneringen", doelgroep: "admin", schermen: ["/facturen"],
    doel: "Openstaande facturen opvolgen binnen de wettelijke regels.",
    stappen: [
      { titel: "Factuur vervallen", uitleg: "Rood in de lijst" },
      { titel: "Herinnering 1" },
      { titel: "Herinnering 2", uitleg: "Kosten volgens voorwaarden" },
      { titel: "Herinnering 3 / ingebrekestelling" },
      { titel: "Uitkomst onzeker?", keuze: ["Ja → handmatig nakijken", "Nee → volgende stap na wachttijd"] },
    ],
    details: ["Kosten volgen de voorwaarden binnen de Belgische wettelijke grenzen, verschillend voor particulier en bedrijf.", "Elke stap wordt maar één keer verstuurd.", "Facturenlijst: groen = betaald, wit = open, rood = vervallen."],
  },
  {
    id: "creditnota", titel: "Creditnota maken", doelgroep: "admin", schermen: ["/facturen"],
    doel: "Een foute factuur rechtzetten.",
    stappen: [
      { titel: "Factuur openen" },
      { titel: "Creditnota maken", uitleg: "Negatieve bedragen, zelfde nummering" },
      { titel: "Aanpassen", uitleg: "Tot verzonden of verrekend" },
      { titel: "Verzenden en verrekenen" },
    ],
    details: ["Creditnota's zijn altijd negatief en herkenbaar.", "Na verzending of verrekening is de creditnota vergrendeld."],
  },
  {
    id: "aankoop-ontvangst", titel: "Aankoopfacturen ontvangen", doelgroep: "admin", schermen: ["/aankoopfacturen"],
    doel: "Alle aankoopfacturen op één plek, klaar om te controleren.",
    stappen: [
      { titel: "Bron?", keuze: ["Peppol (elke 5 min)", "Mail boekhouding@riory.be", "Bonnetje scannen (telefoon)", "Upload"] },
      { titel: "Origineel privé bewaard" },
      { titel: "AI leest uit", uitleg: "Lijnen, btw, korting, IBAN/BIC, vervaldag" },
      { titel: "Dubbel?", keuze: ["Ja → gemarkeerd, verwijderbaar", "Nee → Te controleren"] },
    ],
    details: [
      "Peppol heeft voorrang op mail; van mails worden enkel ontbrekende documenten ingelezen.",
      "Dubbels: zelfde leverancier + factuurnummer, of zonder nummer zelfde leverancier + datum + bedrag. Betaalde of klaargezette facturen zijn beschermd tegen verwijderen.",
      "Kortingen worden één keer van het totaal afgetrokken.",
      "Ontbreekt de BIC, dan wordt die uit de IBAN afgeleid; een zelf ingevulde BIC wordt nooit overschreven.",
      "Bonnetje scannen: Camera openen of Foto kiezen; de scan staat meteen bij Te controleren, ook als uitlezen mislukt.",
      "Simpla-aankopen worden niet meer ingelezen.",
    ],
  },
  {
    id: "aankoop-controle", titel: "Aankoopfactuur controleren", doelgroep: "admin", schermen: ["/aankoopfacturen"],
    doel: "Elke aankoop juist geboekt.",
    stappen: [
      { titel: "Controleren", uitleg: "Origineel naast formulier" },
      { titel: "Leverancier uit lijst" },
      { titel: "Lijnen nakijken", uitleg: "Btw% en rekening per lijn" },
      { titel: "Betaalwijze", keuze: ["Overschrijving → IBAN/BIC nodig", "Kaart/domiciliëring → niet nodig"] },
      { titel: "Opslaan en volgende" },
    ],
    details: [
      "Btw-tarieven 0, 6 of 21%; aankoop-btw gaat naar 411000 (terug te vorderen).",
      "Wijzigingen aan btw-nummer, IBAN en BIC worden op de leveranciersfiche bewaard.",
      "Zonder gestructureerde mededeling wordt het factuurnummer het betaalkenmerk.",
      "Bij een creditnota kies je dat expliciet; leverancierscreditnota's gaan niet mee in SEPA.",
      "De app leert boekingssuggesties per leverancier.",
    ],
  },
  {
    id: "sepa", titel: "Leveranciers betalen (SEPA)", doelgroep: "admin", schermen: ["/aankoopfacturen"],
    doel: "Meerdere facturen in één keer klaarzetten bij de bank.",
    stappen: [
      { titel: "Facturen selecteren" },
      { titel: "Wanneer?", keuze: ["Op vervaldag", "Zo snel mogelijk"] },
      { titel: "SEPA-bestand downloaden" },
      { titel: "Uploaden bij de bank en bevestigen", uitleg: "Zelf, in de bankapp" },
    ],
    details: ["De app voert zelf geen betaling uit; ze zet alleen klaar.", "Klaargezette facturen zijn beschermd tegen verwijderen."],
  },
  {
    id: "bank", titel: "Bank afletteren", doelgroep: "admin", schermen: ["/boekhouding", "/finance"],
    doel: "Elke bankverrichting aan de juiste factuur koppelen.",
    stappen: [
      { titel: "Bankverrichtingen", uitleg: "Ponto, CODA, CSV/Excel" },
      { titel: "Voorstel juist?", keuze: ["Ja → koppelen", "Nee → Factuur kiezen", "Meerdere facturen → bedrag verdelen", "Onduidelijk → wachtrekening 499000"] },
      { titel: "Bedrag kleiner?", keuze: ["Rest blijft open", "Te veel → terugstorting koppelen"] },
      { titel: "Afgeletterd" },
    ],
    details: [
      "Automatisch afletteren gebeurt enkel bij een eenduidige match.",
      "Deelbetalingen laten het restbedrag open; overbetalingen worden geblokkeerd tenzij je een terugstorting koppelt.",
      "Interne transfers tussen 550200, 550400 en spaarrekening 550700 worden herkend.",
      "Kaartbetalingen Europabank: bruto bedrag, commissie op 653000.",
      "Ook op de wachtrekening kan je later facturen toevoegen.",
    ],
  },
  {
    id: "boekhouder", titel: "Alles naar de boekhouder", doelgroep: "admin", schermen: ["/facturen", "/boekhouding"],
    doel: "De boekhouder alle stukken voor een periode bezorgen.",
    stappen: [
      { titel: "Alles naar boekhouder" },
      { titel: "Begin- en einddatum kiezen" },
      { titel: "Enkel nog niet verzonden?", keuze: ["Ja (standaard)", "Nee → alles"] },
      { titel: "Waarschuwing bij onvolledige boekhouding" },
      { titel: "Mail 1: UBL's · Mail 2: balans, tabellen, dagboeken" },
    ],
    details: ["Volledige balans in Excel: Boekhouding → Balans & resultaat → Volledige balans (Excel)."],
  },
  {
    id: "nieuwsbrief", titel: "Nieuwsbrieven", doelgroep: "admin", schermen: ["/nieuwsbrieven"],
    doel: "Klanten informeren met correcte toestemming.",
    stappen: [
      { titel: "Nieuwe nieuwsbrief" },
      { titel: "AI-voorstel (optioneel)" },
      { titel: "Concept bewaren" },
      { titel: "Ontvangers", uitleg: "Alle ingeschreven klanten" },
    ],
    details: ["Uitgeschreven adressen worden altijd uitgesloten; elke mail heeft een uitschrijflink."],
  },
  {
    id: "fotos", titel: "Foto's en filmpjes", doelgroep: "admin", schermen: ["/fotos"],
    doel: "Beeldmateriaal per interventie terugvinden en delen.",
    stappen: [
      { titel: "Foto's-pagina", uitleg: "Per interventie met omschrijving" },
      { titel: "Downloaden", keuze: ["Per stuk", "Per interventie (ZIP)", "Eigen selectie"] },
      { titel: "Filmpje voor klant", uitleg: "Kijklink, niet downloadbaar" },
    ],
    details: ["Marketing ziet foto's zonder prijzen."],
  },
  {
    id: "werkbon-correctie", titel: "Afgewerkte werkbon aanpassen", doelgroep: "admin", schermen: ["/afgewerkte-werkbonnen"],
    doel: "Fouten herstellen zonder de werkbon te heropenen.",
    stappen: [
      { titel: "Afgewerkte werkbonnen" },
      { titel: "Werkbon openen" },
      { titel: "Wat?", keuze: ["Gegevens aanpassen", "Foute betaling verwijderen (status en handtekening blijven)", "Opnieuw mailen naar klant"] },
    ],
    details: ["De werkbonmail naar de klant is prijsloos, tenzij afgerekend: dan staan enkel bedrag, wijze en datum van betaling erop.", "Foto's en handtekening staan op de PDF."],
  },

  // ───────────── PLOEG ─────────────
  {
    id: "ploeg-aanmelden", titel: "Eerste keer aanmelden", doelgroep: "ploeg", schermen: [],
    doel: "Je eigen wachtwoord kiezen en aanmelden.",
    stappen: [
      { titel: "WhatsApp-bericht", uitleg: "Van de beheerder" },
      { titel: "Link openen", uitleg: "Binnen 72 uur" },
      { titel: "Wachtwoord kiezen" },
      { titel: "Aanmelden", uitleg: "Ploegnaam + wachtwoord" },
      { titel: "App op beginscherm zetten" },
    ],
    details: ["De link werkt maar één keer. Verlopen? Vraag de beheerder een nieuwe uitnodiging.", "Je hebt geen e-mailadres nodig.", "Knop 'Aa' maakt letters en knoppen groter."],
  },
  {
    id: "ploeg-taken", titel: "Je taken bekijken", doelgroep: "ploeg", schermen: ["/kalender"],
    doel: "Weten waar je vandaag en morgen moet zijn.",
    stappen: [
      { titel: "Kalender openen" },
      { titel: "Vandaag, morgen, nog in te plannen" },
      { titel: "Labels lezen", uitleg: "Dringend, Eerste klant" },
      { titel: "Taak openen", uitleg: "Volledige omschrijving" },
    ],
    details: [
      "Je ziet alleen taken die aan jouw ploeg zijn toegewezen.",
      "'Eerste klant' betekent: deze afspraak eerst (08:00–09:00).",
      "Bij een offerte staat UIT TE VOEREN en NIET GEKOZEN DOOR KLANT — NIET UITVOEREN. Voer enkel het gekozen werk uit.",
      "Of je prijzen en klantgegevens ziet, bepaalt de beheerder.",
    ],
  },
  {
    id: "ploeg-uitvoeren", titel: "Taak uitvoeren", doelgroep: "ploeg", schermen: ["/kalender"],
    doel: "Tijd, materialen en foto's correct registreren.",
    stappen: [
      { titel: "Aankomst → Start" },
      { titel: "Werk uitvoeren" },
      { titel: "Materialen kiezen", uitleg: "Uit de productlijst" },
      { titel: "Foto's nemen" },
      { titel: "Vertrek → Stop" },
    ],
    details: [
      "Een lopende taak heeft een gekleurde rand; de lijst ververst elke 10 seconden.",
      "Vergeten te starten? Als de beheerder het toelaat, vul je de uren handmatig in.",
      "Het werkbonnummer verschijnt bij de eerste start.",
      "Foto's komen als bijlage op de werkbon voor de klant.",
    ],
  },
  {
    id: "ploeg-afsluiten", titel: "Taak afsluiten", doelgroep: "ploeg", schermen: ["/kalender"],
    doel: "Van taak een werkbon maken.",
    stappen: [
      { titel: "Hoe afsluiten?", keuze: ["Aftekenen: klant tekent + naam", "Afrekenen: cash, Bancontact of overschrijving"] },
      { titel: "Opslaan" },
      { titel: "Werkbon gemaild naar klant", uitleg: "Automatisch" },
      { titel: "Terug naar je lijst" },
    ],
    details: [
      "Afrekenen sluit de taak ook af; er is dan geen handtekening nodig.",
      "Afrekenen is enkel zichtbaar als de beheerder het toelaat.",
      "Lukt de mail niet, dan is je werk toch bewaard en ga je gewoon terug naar je lijst.",
    ],
  },
  {
    id: "ploeg-beginscherm", titel: "App op je beginscherm", doelgroep: "ploeg", schermen: [],
    doel: "De app openen zoals een gewone app.",
    stappen: [
      { titel: "Toestel?", keuze: ["iPhone: Safari → deel-icoon → Zet op beginscherm", "Android: Chrome → ⋮ → Toevoegen aan startscherm", "Computer: installatie-icoon in adresbalk"] },
      { titel: "Icoon tikken", uitleg: "Neushoorn met klembord" },
    ],
    details: [],
  },
];

export const processenVoor = (doelgroep: Doelgroep) => processen.filter((p) => p.doelgroep === doelgroep);
export const processenVoorScherm = (pad: string, doelgroep: Doelgroep) =>
  processen.filter((p) => p.doelgroep === doelgroep && p.schermen.some((s) => pad === s || pad.startsWith(`${s}/`)));
