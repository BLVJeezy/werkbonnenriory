import { expect, it } from "vitest";
import { productPhotoPaths, quoteProductValues } from "./product-photos";

const path = "12345678-1234-1234-1234-123456789012.jpg";
it("neemt productfoto’s mee in de offerte zonder ze later met het product te wijzigen", () => {
  const product = { name: "Regenput", unit: "st", price: 250, photo_paths: [path] };
  const line = quoteProductValues(product);
  product.photo_paths.length = 0;
  expect(line.photoPaths).toEqual([path]);
});
it("beperkt offertefoto’s tot privé-productpaden, zonder externe URL’s of andere bestanden", () => {
  expect(productPhotoPaths([path, path, "https://example.com/photo.jpg", "../private.pdf"])).toEqual([path]);
});