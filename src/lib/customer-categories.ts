import { formatAddress } from "./address";
import { customerDetailsFromDir, type SyndicusDir } from "./syndici";
import { syndicusDetailsPatch } from "./syndicus";

export type CustomerCategory =
  | "zakelijk"
  | "vme"
  | "particulier"
  | "patrimoniumvennootschap";

export type CustomerCategoryFilter = "all" | "unassigned" | CustomerCategory;

export const CUSTOMER_CATEGORIES: { value: CustomerCategory; label: string }[] = [
  { value: "zakelijk", label: "Zakelijk" },
  { value: "vme", label: "VME" },
  { value: "particulier", label: "Particulier" },
  { value: "patrimoniumvennootschap", label: "Patrimoniumvennootschap" },
];

export const UNASSIGNED_CATEGORY_LABEL = "Niet ingedeeld";
export const VME_SYNDICUS_PENDING_LABEL = "Nog toe te wijzen";
export const SYNDICUS_FILTER_PENDING = "__pending__";

const VALID_CATEGORIES = new Set<string>(CUSTOMER_CATEGORIES.map((c) => c.value));

export function isCustomerCategory(value: unknown): value is CustomerCategory {
  return typeof value === "string" && VALID_CATEGORIES.has(value);
}

export function customerCategoryLabel(category: string | null | undefined): string {
  const match = CUSTOMER_CATEGORIES.find((c) => c.value === category);
  return match ? match.label : UNASSIGNED_CATEGORY_LABEL;
}

export type CategorizableCustomer = {
  id: string;
  name: string;
  customer_number?: string | null;
  customer_category?: string | null;
  syndicus_id?: string | null;
  vme_syndicus_pending?: boolean | null;
  syndicus?: string | null;
  syndicus_company?: string | null;
  vat_number?: string | null;
  email?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

export function resolveCustomerSyndicusName(
  c: Pick<CategorizableCustomer, "customer_category" | "syndicus_id" | "vme_syndicus_pending" | "syndicus_company" | "syndicus">,
  directory: Pick<SyndicusDir, "id" | "company">[],
): string {
  if (c.syndicus_id) {
    const found = directory.find((d) => d.id === c.syndicus_id);
    if (found?.company?.trim()) return found.company.trim();
  }
  const fallback = (c.syndicus_company ?? c.syndicus ?? "").trim();
  if (fallback) return fallback;
  if (c.customer_category === "vme" && c.vme_syndicus_pending) return VME_SYNDICUS_PENDING_LABEL;
  return "";
}

export function filterCustomersByCategoryAndSyndicus<T extends CategorizableCustomer>(
  customers: T[],
  filters: {
    categoryFilter: CustomerCategoryFilter;
    syndicusFilter?: string;
  },
): T[] {
  const { categoryFilter, syndicusFilter = "" } = filters;
  return customers.filter((c) => {
    const cat = isCustomerCategory(c.customer_category) ? c.customer_category : null;
    if (categoryFilter === "unassigned") {
      if (cat !== null) return false;
    } else if (categoryFilter !== "all") {
      if (cat !== categoryFilter) return false;
    }

    if (categoryFilter === "vme" && syndicusFilter) {
      if (syndicusFilter === SYNDICUS_FILTER_PENDING) {
        return !c.syndicus_id && !(c.syndicus_company ?? c.syndicus ?? "").trim();
      }
      return c.syndicus_id === syndicusFilter;
    }
    return true;
  });
}

export type CategoryPatchResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Pure validator & patch builder for category updates.
 * - Selecting VME requires either a linked syndicus (from `syndici` directory) or explicit `vmePending: true`.
 * - Leaving VME clears the VME-only syndicus link when `clearSyndicusOnLeave` is confirmed.
 */
export function buildCategoryUpdatePatch(params: {
  nextCategory: CustomerCategory | null;
  previousCategory?: string | null;
  syndicus?: SyndicusDir | null;
  vmePending?: boolean;
  clearSyndicusOnLeave?: boolean;
}): CategoryPatchResult {
  const { nextCategory, previousCategory, syndicus, vmePending = false, clearSyndicusOnLeave = false } = params;

  if (nextCategory === "vme") {
    if (syndicus?.id) {
      const details = syndicusDetailsPatch(customerDetailsFromDir(syndicus));
      return {
        ok: true,
        patch: {
          customer_category: "vme",
          syndicus_id: syndicus.id,
          vme_syndicus_pending: false,
          ...details,
        },
      };
    }
    if (vmePending) {
      return {
        ok: true,
        patch: {
          customer_category: "vme",
          syndicus_id: null,
          vme_syndicus_pending: true,
        },
      };
    }
    return {
      ok: false,
      error: "Kies eerst een verantwoordelijke syndicus voor deze VME of markeer expliciet als 'Nog toe te wijzen'.",
    };
  }

  const patch: Record<string, unknown> = {
    customer_category: nextCategory,
    vme_syndicus_pending: false,
  };

  if (previousCategory === "vme" && clearSyndicusOnLeave) {
    Object.assign(patch, {
      syndicus_id: null,
      ...syndicusDetailsPatch({}),
    });
  }

  return { ok: true, patch };
}

/** Prevents CSV / Excel formula injection (=, +, -, @, tab, CR). */
export function sanitizeSpreadsheetCell(value: string | null | undefined): string {
  const raw = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (!raw) return "";
  if (/^[=+\-@\t\r]/.test(raw)) return `'${raw}`;
  return raw;
}

export type CustomerExportRow = {
  Klantnaam: string;
  Klantnummer: string;
  Categorie: string;
  Syndicus: string;
  "Btw- / ondernemingsnummer": string;
  "E-mail"?: string;
  "E-mail facturatie"?: string;
  Telefoon?: string;
  Adres?: string;
};

export function buildCustomerExportRows(
  customers: CategorizableCustomer[],
  directory: Pick<SyndicusDir, "id" | "company">[],
  options: { includeContactAndAddress: boolean },
): CustomerExportRow[] {
  return customers.map((c) => {
    const isVme = c.customer_category === "vme";
    const syndicusName = isVme ? resolveCustomerSyndicusName(c, directory) : "";
    const base: CustomerExportRow = {
      Klantnaam: sanitizeSpreadsheetCell(c.name),
      Klantnummer: sanitizeSpreadsheetCell(c.customer_number),
      Categorie: sanitizeSpreadsheetCell(customerCategoryLabel(c.customer_category)),
      Syndicus: sanitizeSpreadsheetCell(syndicusName),
      "Btw- / ondernemingsnummer": sanitizeSpreadsheetCell(c.vat_number),
    };
    if (options.includeContactAndAddress) {
      base["E-mail"] = sanitizeSpreadsheetCell(c.email);
      base["E-mail facturatie"] = sanitizeSpreadsheetCell(c.billing_email);
      base.Telefoon = sanitizeSpreadsheetCell(c.phone);
      base.Adres = sanitizeSpreadsheetCell(formatAddress(c));
    }
    return base;
  });
}

function csvEscape(cell: string): string {
  if (/[",;\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

/** Builds an Excel-friendly UTF-8 BOM CSV string from already-sanitized export rows. */
export function customersToCsv(rows: CustomerExportRow[], includeContactAndAddress: boolean): string {
  const headers: (keyof CustomerExportRow)[] = includeContactAndAddress
    ? ["Klantnaam", "Klantnummer", "Categorie", "Syndicus", "Btw- / ondernemingsnummer", "E-mail", "E-mail facturatie", "Telefoon", "Adres"]
    : ["Klantnaam", "Klantnummer", "Categorie", "Syndicus", "Btw- / ondernemingsnummer"];
  const lines = [
    headers.map((h) => csvEscape(String(h))).join(";"),
    ...rows.map((r) => headers.map((h) => csvEscape(String(r[h] ?? ""))).join(";")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}