// Client-safe constants & types voor arbeidsovereenkomsten.

export const CONTRACT_TYPES = [
  { value: "indefinite", label: "Arbeidsovereenkomst onbepaalde duur" },
  { value: "fixed_term", label: "Arbeidsovereenkomst bepaalde duur" },
  { value: "student", label: "Studentenovereenkomst" },
  { value: "self_employed", label: "Zelfstandige / bedrijfsleider" },
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number]["value"];

export const CONTRACT_BENEFITS = [
  { value: "meal_vouchers", label: "Maaltijdcheques" },
  { value: "company_car", label: "Bedrijfswagen" },
  { value: "company_bike", label: "Bedrijfsfiets" },
  { value: "computer", label: "PC/laptop/tablet" },
  { value: "phone", label: "GSM/smartphone" },
] as const;

export type ContractBenefit = (typeof CONTRACT_BENEFITS)[number]["value"];

export function selectedContractBenefits(values: unknown) {
  const selected = new Set(Array.isArray(values) ? values : []);
  return CONTRACT_BENEFITS.filter((benefit) => selected.has(benefit.value));
}

// Verwijder uitsluitend lege modelkeuzes; expliciete afspraken blijven behouden.
export function removeUnselectedContractOptions(body: string): string {
  const lines = body.split("\n");
  const isEmptyModelChoice = (line: string) =>
    /^\s*\[ \] (?:Maaltijdcheques|Bedrijfswagen|Bedrijfsfiets|PC\/laptop\/tablet|GSM\/smartphone|\.{3,}|Onbepaalde duur|Bepaalde duur tot en met .+|Bepaald werk, namelijk \.{3,}|Vervanging van de volgende werknemer: \.{3,})\s*$/.test(line);
  const kept = lines.filter((line, index) => {
    if (isEmptyModelChoice(line)) return false;
    if (/^\s*De reden van vervanging is: \.{3,}\s*$/.test(line) &&
        /^\s*\[ \] Vervanging/.test(lines[index - 1] ?? "")) return false;
    if (line.trim() === "Andere (loon)voordelen:") {
      let next = index + 1;
      while (next < lines.length && /^\s*\[[ X]\]/.test(lines[next] ?? "")) {
        if (/^\s*\[X\]/.test(lines[next] ?? "")) return true;
        next += 1;
      }
      // Een vrije tekstafspraak onder dit kopje niet verwijderen.
      return Boolean(lines[next]?.trim());
    }
    return true;
  });
  return kept.join("\n");
}

export const CONTRACT_STATUSES = [
  { value: "draft", label: "Klad" },
  { value: "awaiting_signature", label: "Te ondertekenen" },
  { value: "signed", label: "Ondertekend" },
  { value: "archived", label: "Gearchiveerd" },
] as const;

export const contractTypeLabel = (value: string) =>
  CONTRACT_TYPES.find((t) => t.value === value)?.label ?? "Overeenkomst";

export const contractStatusLabel = (value: string) =>
  CONTRACT_STATUSES.find((s) => s.value === value)?.label ?? value;

export type CompanySettings = {
  id: string;
  company_name: string;
  legal_form: string | null;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  enterprise_number: string | null;
  vat_number: string | null;
  rsz_number: string | null;
  joint_committee: string | null;
  representative_name: string | null;
  representative_role: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  workplace_address: string | null;
  insurance_company: string | null;
  social_secretariat: string | null;
  default_weekly_hours: number;
  default_schedule: string | null;
  extra_clauses: string | null;
};

export type ContractRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  contract_type: string;
  status: string;
  job_title: string | null;
  workplace: string | null;
  starts_on: string | null;
  ends_on: string | null;
  weekly_hours: number | null;
  schedule: string | null;
  wage_mode: string;
  wage_amount: number | null;
  joint_committee: string | null;
  trial_clause: string | null;
  notice_clause: string | null;
  extra_clauses: string | null;
  student_yearly_hours: number | null;
  body: string;
  employer_signed_name: string | null;
  employer_signed_at: string | null;
  employer_signature_image?: string | null;
  employee_signed_name: string | null;
  employee_signed_at: string | null;
  employee_signature_image?: string | null;
  created_at: string;
};
