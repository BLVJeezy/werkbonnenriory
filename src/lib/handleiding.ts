// Handleiding van de app. Bij elke functionele wijziging in de app dit bestand mee aanpassen,
// zodat de handleidingpagina en de PDF altijd overeenkomen met het systeem.
export const HANDLEIDING_VERSIE = "8 november 2026";

export type Sectie = { titel: string; punten: string[] };
export type Deel = { titel: string; intro: string; secties: Sectie[] };

export const handleiding: Deel[] = [
  {
    titel: "Deel 1 — Voor de beheerder",
    intro: "Als beheerder (info@riory.be) beheer je de volledige app: planning, klanten, offertes, facturen en boekhouding.",
    secties: [
      { titel: "Aanmelden en startpagina", punten: [
        "Meld je aan met je e-mailadres en wachtwoord. Wachtwoord vergeten? Gebruik 'Wachtwoord vergeten' op het aanmeldscherm.",
        "Je start op het Dashboard met omzet, kosten, resultaat, omzet per dag en omzet per product voor een zelf gekozen periode.",
      ] },
      { titel: "Kalender en taken", punten: [
        "Alle taken beheer je in de Kalender. Nieuwe opdrachten uit de mailbox afspraak@riory.be komen elke dag binnen bij 'Nog in te plannen'.",
        "Kies op een kaart snel een dag, ploeg en activiteit. Met de knop 'Dringend' markeer je een opdracht zonder ze te openen.",
        "Het label 'Eerste klant' (08:00–09:00) toont welke afspraak eerst geholpen moet worden.",
        "Vanuit een taak kan je meteen een offerte maken. Offertetaken verdwijnen tot de klant akkoord geeft.",
      ] },
      { titel: "Klanten en syndici", punten: [
        "Klanten komen automatisch uit mails of voeg je handmatig toe. Adressen zijn altijd opgesplitst in straat, nr., postcode en plaats.",
        "Vul een btw- of ondernemingsnummer in: naam en adres worden automatisch aangevuld.",
        "Bij een syndicusopdracht is de VME de klant en wordt gefactureerd op het werfadres. De syndicus staat als extra informatie op de fiche.",
        "Bewaar contactpersonen bij een VME zodat je ze de volgende keer kan kiezen.",
      ] },
      { titel: "Ploegen", punten: [
        "Maak ploegen aan bij Instellingen. Een ploeg meldt aan met ploegnaam en wachtwoord, zonder e-mail.",
        "Kies per ploeg of prijzen, klantgegevens, afrekenen en afgetekende werkbonnen zichtbaar zijn.",
        "Stuur een uitnodiging via WhatsApp; de ploeg kiest zelf een wachtwoord.",
      ] },
      { titel: "Offertes en bestekken", punten: [
        "Maak offertes met producten, foto's, titels en optionele regels. De klant tekent online; niet-gekozen opties worden niet uitgevoerd.",
        "Na akkoord ontstaat automatisch een taak in de Kalender. Herinneringen gaan na 7 en 10 dagen; daarna best bellen.",
        "Verzekeringsverslagen zijn prijsloos; het bestek maak je apart.",
      ] },
      { titel: "Werkbonnen en facturen", punten: [
        "Een taak heet pas werkbon na aftekenen (handtekening + naam klant) of afrekenen.",
        "Arbeid: eerste uur volledig, daarna per begonnen kwartier. Kilometers heen en terug vanaf de dichtstbijzijnde vestiging.",
        "Btw wordt automatisch bepaald per klant (0% verlegd, 6% renovatie, 21%).",
        "Selecteer afgewerkte werkbonnen om te factureren; bonnen van dezelfde klant komen samen op één factuur. Bonnen met 'Niet factureren' worden overgeslagen.",
        "Facturen gaan via boekhouding@riory.be en via Peppol (Peppyrus). Je ziet of de factuurmail geopend werd.",
      ] },
      { titel: "Aankoopfacturen en boekhouding", punten: [
        "Aankoopfacturen komen via Peppol, mail, uploads of de knop 'Bonnetje scannen' op je telefoon en staan bij 'Te controleren'.",
        "Controleer naast het originele document en klik 'Opslaan en volgende'. Betaal in bulk met een SEPA-bestand.",
        "In Boekhouding lettert je bankverrichtingen af, ook verdeeld over meerdere facturen of via de wachtrekening.",
        "Met 'Alles naar boekhouder' stuur je UBL's en overzichten voor een gekozen periode.",
      ] },
    ],
  },
  {
    titel: "Deel 2 — Voor de ploeg",
    intro: "Als ploeg zie je alleen de taken die aan jou toegewezen zijn: vandaag, morgen en nog in te plannen.",
    secties: [
      { titel: "Aanmelden", punten: [
        "Meld aan met je ploegnaam en het wachtwoord dat je zelf koos via de WhatsApp-uitnodiging.",
        "Met de knop 'Aa' maak je de letters groter.",
      ] },
      { titel: "Een taak uitvoeren", punten: [
        "Open de taak en lees de volledige omschrijving. Bij offertes staat duidelijk wat wel en niet uitgevoerd wordt.",
        "Druk op Start bij aankomst en Stop bij vertrek. Kies gebruikte materialen uit de productlijst.",
        "Neem foto's van het werk; ze komen op de werkbon.",
      ] },
      { titel: "Afsluiten", punten: [
        "Aftekenen: laat de klant tekenen op het scherm en vul de naam in.",
        "Afrekenen (indien toegestaan): noteer cash, Bancontact of overschrijving. Dit sluit de taak ook af.",
        "De werkbon wordt automatisch naar de klant gemaild.",
      ] },
    ],
  },
  {
    titel: "Deel 3 — De app op je beginscherm",
    intro: "Zet de app op je beginscherm, dan opent ze als een gewone app.",
    secties: [
      { titel: "iPhone / iPad (Safari)", punten: ["Open de app in Safari.", "Tik op het deel-icoon (vierkant met pijl).", "Kies 'Zet op beginscherm' en tik 'Voeg toe'."] },
      { titel: "Android (Chrome)", punten: ["Open de app in Chrome.", "Tik op de drie puntjes rechtsboven.", "Kies 'Toevoegen aan startscherm' of 'App installeren'."] },
      { titel: "Computer (Chrome / Edge)", punten: ["Klik in de adresbalk op het installatie-icoon.", "Of maak een bladwijzer aan."] },
    ],
  },
];
