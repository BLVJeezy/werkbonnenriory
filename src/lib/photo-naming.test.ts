import { describe, expect, it } from "vitest";
import { extFromPath, photoFileName, photoFolderName, photoZipName, slug, uniqueEntryName } from "./photo-naming";

const bron = { number: 101, customer: "Mario Franceschi", city: "Bilzen", date: "2026-10-15" };

describe("photo-naming", () => {
  it("maakt van een opslagpad een herkenbare bestandsnaam", () => {
    expect(photoFileName(bron, 0, "3f2a…-9c1d.jpg")).toBe("wb-101-mario-franceschi-bilzen-2026-10-15-01.jpg");
    expect(photoFileName(bron, 9, "3f2a…-9c1d.png")).toBe("wb-101-mario-franceschi-bilzen-2026-10-15-10.png");
  });

  it("gebruikt wb-nieuw wanneer de taak nog geen werkbonnummer heeft", () => {
    expect(photoFolderName({ number: null, customer: "Nieuwe Klant", city: null, date: null })).toBe("wb-nieuw-nieuwe-klant");
  });

  it("verwijdert accenten en leestekens", () => {
    expect(slug("Épée & Fils 's-Gravoele")).toBe("epee-fils-s-gravoele");
  });

  it("valt terug op jpg bij een onbekende of ontbrekende extensie", () => {
    expect(extFromPath("foto.HEIC")).toBe("heic");
    expect(extFromPath("pad/zonder-extensie")).toBe("jpg");
    expect(extFromPath("exec.sh")).toBe("jpg");
  });

  it("houdt dubbele namen in een zip uniek", () => {
    const used = new Set<string>();
    expect(uniqueEntryName("a/foto.jpg", used)).toBe("a/foto.jpg");
    expect(uniqueEntryName("a/foto.jpg", used)).toBe("a/foto-2.jpg");
    expect(uniqueEntryName("a/foto.jpg", used)).toBe("a/foto-3.jpg");
  });

  it("noemt een zip naar de interventie of naar het aantal", () => {
    expect(photoZipName([bron])).toBe("riory-fotos-wb-101-mario-franceschi-bilzen-2026-10-15.zip");
    expect(photoZipName([bron, bron])).toBe("riory-fotos-2-interventies.zip");
  });
});
