// Genereert de contracttekst volgens het model "Arbeidsovereenkomst voor arbeiders"
// (Belgische arbeidswetgeving). Server-only: enkel opgeroepen binnen server function handlers.

import type { CompanySettings, ContractType } from "@/lib/tikklok/contract-types";
import { selectedContractBenefits } from "@/lib/tikklok/contract-types";
import { describeSalaryAdvances } from "@/lib/tikklok/salary-advances";

export type ContractParams = {
  contractType: ContractType;
  jobTitle: string;
  workplace: string;
  startsOn: string;
  endsOn: string | null;
  weeklyHours: number | null;
  schedule: string;
  wageMode: "monthly" | "hourly";
  wageAmount: number | null;
  jointCommittee: string;
  trialClause: string;
  noticeClause: string;
  extraClauses: string;
  studentYearlyHours: number | null;
  benefits?: string[];
};

export type EmployeeForContract = {
  name: string;
  email?: string | null;
  phone?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  national_number?: string | null;
  iban?: string | null;
  job_category?: string | null;
  job_tasks?: string | null;
  salary_advances?: unknown;
  salary_settlement_day?: number | null;
};

const DOTS = "...............";

const dateNl = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("nl-BE", { day: "2-digit", month: "long", year: "numeric" })
    : DOTS;

const money = (value: number | null | undefined) =>
  value == null ? DOTS : new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2 }).format(value);

const num = (value: number | null | undefined) =>
  value == null ? DOTS : new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(value);

const or = (value: string | null | undefined) => (value && value.trim() ? value.trim() : DOTS);

const TITLES: Record<ContractType, string> = {
  indefinite: "Arbeidsovereenkomst voor arbeiders",
  fixed_term: "Arbeidsovereenkomst voor arbeiders",
  student: "Overeenkomst voor tewerkstelling van studenten",
  self_employed: "Overeenkomst van zelfstandige samenwerking / bedrijfsleider",
};

function addressLine(
  street?: string | null,
  postal?: string | null,
  city?: string | null,
  country?: string | null,
) {
  const parts = [street, postal, city, country].map((p) => (p && p.trim() ? p.trim() : DOTS));
  return parts.join(" ");
}

export function buildContractBody(
  company: CompanySettings,
  employee: EmployeeForContract,
  p: ContractParams,
): string {
  const isStudent = p.contractType === "student";
  const isSelf = p.contractType === "self_employed";
  const jc = p.jointCommittee || company.joint_committee || null;
  const hours = p.weeklyHours ?? company.default_weekly_hours ?? null;
  const roleWord = isSelf ? "de dienstverlener" : isStudent ? "de student" : "de arbeider";
  const RoleWord = roleWord.charAt(0).toUpperCase() + roleWord.slice(1);
  const workerLabel = isSelf ? "ZELFSTANDIGE" : isStudent ? "STUDENT" : "ARBEIDER";
  const employerLabel = isSelf ? "opdrachtgever" : "werkgever";
  const employeeLabel = isSelf ? "dienstverlener" : isStudent ? "student" : "werknemer";
  const wage =
    p.wageMode === "hourly"
      ? `EUR ${money(p.wageAmount)} bruto per uur`
      : `EUR ${money(p.wageAmount)} bruto per maand`;

  const L: string[] = [];

  L.push(TITLES[p.contractType]);
  L.push("");
  L.push("");
  L.push(
    `de ${employerLabel}: ${or(`${company.company_name}${company.legal_form ? ` ${company.legal_form}` : ""}`)}`,
  );
  L.push(
    `adres: ${addressLine(company.street_address, company.postal_code, company.city, company.country)}`,
  );
  if (company.enterprise_number) L.push(`ondernemingsnummer: ${company.enterprise_number}`);
  if (company.rsz_number) L.push(`RSZ-nummer: ${company.rsz_number}`);
  L.push(
    `vertegenwoordigd door: ${or(company.representative_name)}${company.representative_role ? `, ${company.representative_role}` : ""}`,
  );
  L.push("");
  L.push("en");
  L.push("");
  L.push(`de ${employeeLabel}: ${or(employee.name)}`);
  L.push(
    `adres: ${addressLine(employee.street_address, employee.postal_code, employee.city, employee.country)}`,
  );
  L.push(`geboren te: ${or(employee.birth_place)} op ${dateNl(employee.birth_date)}`);
  L.push(`rijksregisternummer: ${or(employee.national_number)}`);
  L.push("");
  L.push("komen overeen:");
  L.push("");
  L.push("");

  // Artikel 1 — indienstneming en duur
  L.push("Artikel 1");
  L.push(
    `De ${employerLabel} neemt de ${employeeLabel} in dienst als ${workerLabel} vanaf ${dateNl(p.startsOn)}. De overeenkomst wordt gesloten voor:`,
  );
  if (p.contractType === "indefinite" || (isSelf && !p.endsOn)) {
    L.push("Onbepaalde duur");
  } else {
    L.push(`Bepaalde duur tot en met ${dateNl(p.endsOn)}`);
  }
  L.push("");

  // Artikel 2 — arbeidsduur en uurregeling
  L.push("Artikel 2");
  const regime = hours != null && hours >= 35 ? "voltijdse" : hours != null ? "deeltijdse" : DOTS;
  L.push(
    `De overeenkomst wordt gesloten voor een ${regime} betrekking. ${RoleWord} verbindt zich om ${num(hours)} u/week te werken. Alle gegevens betreffende de werkroosters zijn opgenomen in het arbeidsreglement. De werkregeling bestaat uit een vaste/variabele uurregeling.`,
  );
  L.push(`Opmerkingen: ${DOTS}`);
  L.push("");
  L.push("        • Vaste uurregeling, overeenkomstig:");
  L.push(`        ${or(p.schedule || company.default_schedule)}`);
  L.push("        • Variabele uurregeling: volgens het tijdskader opgenomen in het arbeidsreglement.");
  L.push("");

  // Artikel 3 — loon
  L.push("Artikel 3");
  L.push(`Het bruto aanvangsloon van ${roleWord} is vastgesteld op ${wage}.`);
  L.push("");
  const benefits = selectedContractBenefits(p.benefits);
  if (benefits.length > 0) {
    L.push("Andere (loon)voordelen:");
    benefits.forEach((benefit) => L.push(`• ${benefit.label}`));
    L.push("");
  }
  L.push(
    "De loonindexering die zou plaatsvinden tussen het ogenblik van ondertekenen van de arbeidsovereenkomst en de indiensttreding wordt geacht mee vervat te zitten in het in deze arbeidsovereenkomst overeengekomen brutoloon.",
  );
  L.push(
    `Het overeengekomen brutoloon is het loon dat zal gelden op de datum van de indiensttreding, zonder afbreuk te doen aan de sectorale minimumlonen${jc ? ` van paritair comité ${jc}` : ""} die desgevallend van toepassing zijn.`,
  );
  L.push("");

  // Artikel 4 — betaling
  L.push("Artikel 4");
  L.push(
    `${RoleWord} verklaart uitdrukkelijk in te stemmen met de betaling van het loon op rekeningnummer ${or(employee.iban)} en verklaart akkoord te zijn met de elektronische verzending van de loonbrieven.`,
  );
  {
    const advances = describeSalaryAdvances(employee.salary_advances, employee.salary_settlement_day ?? 1);
    if (advances) L.push(advances);
  }
  L.push("");

  // Artikel 5 — functie
  L.push("Artikel 5");
  L.push(`De functie van ${roleWord} is ${or(p.jobTitle)} en houdt volgende taken in: ${or(employee.job_tasks)}`);
  L.push(
    `De beroepscategorie is: ${or(employee.job_category)}${jc ? ` (paritair comité ${jc})` : ""}.`,
  );
  L.push("");

  // Artikel 6 — plaats van tewerkstelling
  L.push("Artikel 6");
  L.push(
    `De plaats van tewerkstelling is: ${or(
      p.workplace ||
        company.workplace_address ||
        [company.street_address, [company.postal_code, company.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
    )}.`,
  );
  L.push(
    "Partijen komen overeen dat de plaats van tewerkstelling geen essentieel bestanddeel van de arbeidsovereenkomst uitmaakt.",
  );
  L.push("");

  // Artikel 7
  L.push("Artikel 7");
  L.push(
    `De ${employerLabel} heeft het recht om het takenpakket van de ${employeeLabel} aan te passen als dit noodzakelijk blijkt voor de goede werking van de onderneming.`,
  );
  L.push("");

  // Artikel 8
  L.push("Artikel 8");
  L.push(
    "Elke betaling buiten de normale bezoldiging of elke vorm van voordeel of premie zal, behoudens tegenstrijdige wettelijke of conventionele bepaling, beschouwd worden als een loutere vrijgevigheid, die geen verworven rechten creëert voor de genieter.",
  );
  L.push("");

  // Artikel 9 — ziekte
  L.push("Artikel 9");
  L.push(
    `In alle geval is de ${employeeLabel} gehouden tot een uitdrukkelijke meldingsplicht bij afwezigheid door ongeval of ziekte, telefonisch binnen de 2 uren na het begin van de arbeidstijd. Dezelfde dag nog moet een arts geraadpleegd worden, waarna de vermoedelijke duurtijd van de ziekte diezelfde dag telefonisch dient gemeld te worden aan de ${employerLabel}. Binnen de 2 werkdagen vanaf de eerste dag van de arbeidsongeschiktheid moet de ${employeeLabel} een geneeskundig getuigschrift bezorgen of met de post versturen; het arbeidsreglement kan hierop een vrijstelling voorzien. Bij verzending per post geldt de postdatum als bewijs. In geval van verlenging van de arbeidsongeschiktheid blijven bovenstaande regels eveneens van toepassing. Bovendien moet de ${employeeLabel} uiterlijk 24 u vóór afloop van het vorige attest de ${employerLabel} verwittigen of hij al dan niet het werk zal kunnen hervatten.`,
  );
  L.push("");

  // Artikel 10
  L.push("Artikel 10");
  L.push(
    "De arbeidsovereenkomst met een werknemer van vreemde nationaliteit wordt steeds gesloten onder opschortende voorwaarde van de afgifte van een geldige arbeidsvergunning en verblijfstitel en neemt automatisch een einde zonder opzegging of zonder vergoeding zodra de werknemer niet meer over een geldige arbeidsvergunning of verblijfstitel beschikt.",
  );
  L.push("");

  // Artikel 11
  L.push("Artikel 11");
  L.push(
    `De ${employeeLabel} verklaart dat hij een afschrift van het arbeidsreglement van de onderneming heeft ontvangen en dat hij alle bepalingen ervan aanvaardt die op heden van kracht zijn.`,
  );
  L.push("");

  // Artikel 12
  L.push("Artikel 12");
  L.push(
    `De ${employeeLabel} erkent verplicht te zijn tot volstrekte geheimhouding over alles wat hij verneemt tijdens de uitoefening van zijn betrekking; deze verplichting geldt zowel tijdens als na de tewerkstelling in de onderneming. Persoonsgegevens worden verwerkt conform de AVG (Verordening EU 2016/679)${company.social_secretariat ? `, onder meer door het sociaal secretariaat ${company.social_secretariat}` : ""}.`,
  );
  L.push("");

  // Artikel 13
  L.push("Artikel 13");
  L.push(
    `Enkel de overuren die op verzoek van de ${employerLabel} gepresteerd worden binnen de wettelijke grenzen kunnen aanleiding geven tot inhaalrust en/of een overloon.`,
  );
  L.push("");

  // Artikel 14 — bijkomende afspraken
  L.push("Artikel 14");
  const extras = [p.trialClause, p.noticeClause, p.extraClauses, company.extra_clauses]
    .filter((v) => v && v.trim())
    .join("\n");
  if (isStudent) {
    L.push(
      `De partijen bevestigen dat het om studentenarbeid gaat waarop de solidariteitsbijdrage van toepassing is, binnen een contingent van ${p.studentYearlyHours ? `${num(p.studentYearlyHours)} uren` : "het wettelijke aantal uren"} per kalenderjaar. De eerste drie arbeidsdagen gelden van rechtswege als proefperiode (art. 127 wet 3 juli 1978).`,
    );
  }
  L.push(`Bovendien is nog uitdrukkelijk overeengekomen: ${extras || DOTS}`);
  L.push("");

  // Artikel 15
  L.push("Artikel 15");
  L.push(
    `Alleen de rechtbanken van het arrondissement van de ${employerLabel} zijn bevoegd om uitspraak te doen over de geschillen in verband met onderhavig contract.`,
  );
  L.push("");
  L.push("");
  L.push(
    `In tweevoud opgemaakt te ${or(company.city)}, op ${dateNl(new Date().toISOString().slice(0, 10))}`,
  );
  L.push("");
  L.push("");
  L.push("");
  L.push(
    `De ${employerLabel},\t\t\t\t\t\t\tDe ${employeeLabel},\n${or(company.representative_name || company.company_name)}\t\t\t\t\t\t\t${or(employee.name)}`,
  );

  return L.join("\n");
}
