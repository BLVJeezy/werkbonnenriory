import { describe, expect, it } from "vitest";
import {
  autoCategoryPatchForIncomingTask,
  buildCategoryUpdatePatch,
  buildCustomerExportRows,
  customerCategoryLabel,
  customersToCsv,
  effectiveCustomerVatRate,
  filterCustomersByCategoryAndSyndicus,
  parseSectorOptionValue,
  resolveUnifiedCategoryLabel,
  sanitizeSpreadsheetCell,
  sectorOptionValue,
  selectableSectorsForCustomer,
  SYNDICUS_FILTER_PENDING,
  UNASSIGNED_CATEGORY_LABEL,
  unifiedCategoryValue,
  validateSectorName,
  VME_SYNDICUS_PENDING_LABEL,
  type CategorizableCustomer,
  type CustomerSector,
} from "./customer-categories";
import type { SyndicusDir } from "./syndici";

const sampleSectors: CustomerSector[] = [
  { id: "sec-horeca", name: "Horeca", archived_at: null },
  { id: "sec-bouw", name: "Bouwbedrijven", archived_at: null },
  { id: "sec-oud", name: "Oude sector", archived_at: "2026-10-01T10:00:00Z" },
];

const dir: SyndicusDir[] = [
  {
    id: "syn-1",
    company: "Immo Schrijnemakers BV",
    contact: "Olivier",
    vat_number: "BE0123456789",
    street: "Hoogstraat",
    house_number: "10",
    postal_code: "3740",
    city: "Bilzen",
    phone: "089111111",
    email: "info@immo.be",
    billing_email: "facturen@immo.be",
  },
  {
    id: "syn-2",
    company: "Syndic Hasselt NV",
    contact: null,
    vat_number: null,
    street: null,
    house_number: null,
    postal_code: null,
    city: "Hasselt",
    phone: null,
    email: null,
    billing_email: null,
  },
];

const sampleCustomers: CategorizableCustomer[] = [
  {
    id: "c1",
    name: "VME Res. Wijkmolen",
    customer_number: "K001",
    customer_category: "vme",
    syndicus_id: "syn-1",
    vme_syndicus_pending: false,
    vat_number: "BE0888111222",
    email: "vme@wijkmolen.be",
    phone: "089222333",
    street: "Molenstraat",
    house_number: "5",
    postal_code: "3740",
    city: "Bilzen",
  },
  {
    id: "c2",
    name: "VME Zonder Syndicus",
    customer_number: "K002",
    customer_category: "vme",
    syndicus_id: null,
    vme_syndicus_pending: true,
  },
  {
    id: "c3",
    name: "Bakkerij Peeters BV",
    customer_number: "K003",
    customer_category: "zakelijk",
    sector_id: "sec-horeca",
    vat_number: "BE0410556656",
  },
  {
    id: "c4",
    name: "=CMD|' /C calc'!A0",
    customer_number: "K004",
    customer_category: null,
    sector_id: "sec-oud",
  },
];

describe("customer-categories", () => {
  it("requires a syndicus relation or explicit pending state when selecting VME", () => {
    const rejected = buildCategoryUpdatePatch({ nextCategory: "vme" });
    expect(rejected.ok).toBe(false);

    const linked = buildCategoryUpdatePatch({ nextCategory: "vme", syndicus: dir[0]! });
    expect(linked.ok).toBe(true);
    if (linked.ok) {
      expect(linked.patch["customer_category"]).toBe("vme");
      expect(linked.patch["syndicus_id"]).toBe("syn-1");
      expect(linked.patch["vme_syndicus_pending"]).toBe(false);
      expect(linked.patch["syndicus_company"]).toBe("Immo Schrijnemakers BV");
    }

    const pending = buildCategoryUpdatePatch({ nextCategory: "vme", vmePending: true });
    expect(pending.ok).toBe(true);
    if (pending.ok) {
      expect(pending.patch["customer_category"]).toBe("vme");
      expect(pending.patch["syndicus_id"]).toBeNull();
      expect(pending.patch["vme_syndicus_pending"]).toBe(true);
    }
  });

  it("clears VME-only syndicus relation only when confirmed on leaving VME", () => {
    const keep = buildCategoryUpdatePatch({
      nextCategory: "zakelijk",
      previousCategory: "vme",
      clearSyndicusOnLeave: false,
    });
    expect(keep.ok).toBe(true);
    if (keep.ok) {
      expect(keep.patch["customer_category"]).toBe("zakelijk");
      expect("syndicus_id" in keep.patch).toBe(false);
    }

    const cleared = buildCategoryUpdatePatch({
      nextCategory: "patrimoniumvennootschap",
      previousCategory: "vme",
      clearSyndicusOnLeave: true,
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.patch["customer_category"]).toBe("patrimoniumvennootschap");
      expect(cleared.patch["syndicus_id"]).toBeNull();
      expect(cleared.patch["syndicus_company"]).toBeNull();
    }
  });

  it("filters by category, unassigned, and VME syndicus including pending", () => {
    expect(filterCustomersByCategoryAndSyndicus(sampleCustomers, { categoryFilter: "all" }).map((c) => c.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
    expect(filterCustomersByCategoryAndSyndicus(sampleCustomers, { categoryFilter: "unassigned" }).map((c) => c.id)).toEqual([]);
    expect(filterCustomersByCategoryAndSyndicus(sampleCustomers, { categoryFilter: sectorOptionValue("sec-horeca") }).map((c) => c.id)).toEqual(["c3"]);
    expect(filterCustomersByCategoryAndSyndicus(sampleCustomers, { categoryFilter: sectorOptionValue("sec-oud") }).map((c) => c.id)).toEqual(["c4"]);
    expect(filterCustomersByCategoryAndSyndicus(sampleCustomers, { categoryFilter: "vme", syndicusFilter: "syn-1" }).map((c) => c.id)).toEqual(["c1"]);
    expect(
      filterCustomersByCategoryAndSyndicus(sampleCustomers, {
        categoryFilter: "vme",
        syndicusFilter: SYNDICUS_FILTER_PENDING,
      }).map((c) => c.id),
    ).toEqual(["c2"]);
    expect(customerCategoryLabel(null)).toBe(UNASSIGNED_CATEGORY_LABEL);
  });

  it("sanitizes formula injection and exports filtered rows with UTF-8 BOM and role-gated fields", () => {
    expect(sanitizeSpreadsheetCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeSpreadsheetCell("+32499112233")).toBe("'+32499112233");
    expect(sanitizeSpreadsheetCell("Normale Klant")).toBe("Normale Klant");

    const rows = buildCustomerExportRows(sampleCustomers, dir, { includeContactAndAddress: true }, sampleSectors);
    expect(rows[0]?.Syndicus).toBe("Immo Schrijnemakers BV");
    expect(rows[1]?.Syndicus).toBe(VME_SYNDICUS_PENDING_LABEL);
    expect(rows[3]?.Klantnaam).toBe("'=CMD|' /C calc'!A0");
    expect(rows[0]?.Categorie).toBe("VME");
    expect(rows[2]?.Categorie).toBe("Horeca");
    expect(rows[3]?.Categorie).toBe("Oude sector");

    const csv = customersToCsv(rows, true);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Immo Schrijnemakers BV");
    expect(csv).toContain("'=CMD|' /C calc'!A0");
    expect(csv).toContain("Categorie;Syndicus");
    expect(csv).toContain("Horeca");
  });

  it("validates custom category creation and rename against empty, standard and duplicate names including archived", () => {
    expect(validateSectorName("   ", sampleSectors).ok).toBe(false);
    expect(validateSectorName("horeca", sampleSectors).ok).toBe(false);
    expect(validateSectorName("VME", sampleSectors).ok).toBe(false);
    expect(validateSectorName("Zakelijk", sampleSectors).ok).toBe(false);
    const archivedClash = validateSectorName("Oude sector", sampleSectors);
    expect(archivedClash.ok).toBe(false);
    if (!archivedClash.ok) expect(archivedClash.error).toContain("gearchiveerd");

    // Renaming a sector to its own name (different casing) is allowed
    const selfRename = validateSectorName("HORECA", sampleSectors, "sec-horeca");
    expect(selfRename).toEqual({ ok: true, name: "HORECA" });

    // New unique sector is accepted and trimmed
    expect(validateSectorName("  Retail  ", sampleSectors)).toEqual({ ok: true, name: "Retail" });
  });

  it("keeps archived custom categories visible for linked customers while hiding them for new assignments", () => {
    const forUnlinked = selectableSectorsForCustomer(sampleSectors, null);
    expect(forUnlinked.map((s) => s.id)).toEqual(["sec-bouw", "sec-horeca"]);

    const forLinked = selectableSectorsForCustomer(sampleSectors, "sec-oud");
    expect(forLinked.map((s) => s.id)).toEqual(["sec-bouw", "sec-horeca", "sec-oud"]);

    expect(resolveUnifiedCategoryLabel({ customer_category: null, sector_id: null }, sampleSectors)).toBe(UNASSIGNED_CATEGORY_LABEL);
    expect(resolveUnifiedCategoryLabel({ customer_category: null, sector_id: "sec-oud" }, sampleSectors, { includeArchivedTag: true })).toBe("Oude sector (gearchiveerd)");
    expect(parseSectorOptionValue(sectorOptionValue("sec-horeca"))).toBe("sec-horeca");
    expect(unifiedCategoryValue({ customer_category: "zakelijk", sector_id: "sec-horeca" })).toBe("sector:sec-horeca");
  });

  it("computes effective customer VAT rate for sorting", () => {
    expect(effectiveCustomerVatRate({ vat_number: "BE0888111222" })).toBe(0);
    expect(effectiveCustomerVatRate({ vat_number: "BE0888111222", vrij_beroep: true })).toBe(21);
    expect(effectiveCustomerVatRate({ default_vat_rate: 6 })).toBe(6);
    expect(effectiveCustomerVatRate({ postal_code: "6211 AA", default_vat_rate: 6 })).toBe(21);
    expect(effectiveCustomerVatRate({})).toBe(21);
  });

  it("auto-assigns particulieren and vrije beroepen on incoming tasks without overwriting existing categories", () => {
    const sectors: CustomerSector[] = [
      ...sampleSectors,
      { id: "sec-vb", name: "Vrije beroepen", archived_at: null },
    ];

    // Vrij beroep krijgt de actieve categorie Vrije beroepen, ook met btw-nummer
    expect(
      autoCategoryPatchForIncomingTask({
        vrijBeroep: true,
        customerType: "business",
        vatNumber: "BE0888111222",
        sectors,
      }),
    ).toEqual({ customer_category: null, sector_id: "sec-vb" });

    // Particulier zonder btw-nummer en geen VME krijgt standaardcategorie particulier
    expect(
      autoCategoryPatchForIncomingTask({
        vrijBeroep: false,
        customerType: "private",
        isVme: false,
        vatNumber: null,
        sectors,
      }),
    ).toEqual({ customer_category: "particulier", sector_id: null });

    // Particulier maar wel VME of met btw-nummer wordt niet als particulier ingedeeld
    expect(
      autoCategoryPatchForIncomingTask({
        vrijBeroep: false,
        customerType: "private",
        isVme: true,
        sectors,
      }),
    ).toBeNull();
    expect(
      autoCategoryPatchForIncomingTask({
        vrijBeroep: false,
        customerType: "private",
        vatNumber: "BE0123456789",
        sectors,
      }),
    ).toBeNull();

    // Bestaande categorie wordt niet overschreven
    expect(
      autoCategoryPatchForIncomingTask({
        existingCategory: "zakelijk",
        vrijBeroep: true,
        sectors,
      }),
    ).toBeNull();
    expect(
      autoCategoryPatchForIncomingTask({
        existingSectorId: "sec-horeca",
        vrijBeroep: false,
        customerType: "private",
        sectors,
      }),
    ).toBeNull();
  });
});