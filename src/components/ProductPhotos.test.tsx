import { expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductPhotoEditor, ProductPhotoGallery } from "./ProductPhotos";

it("handles cached products from before the photo column existed in gallery and editor", () => {
  const client = new QueryClient();
  expect(() => renderToString(<QueryClientProvider client={client}>
    <ProductPhotoGallery title="Bestaand product" />
    <ProductPhotoEditor title="Bestaand product" onChange={() => {}} />
    <ProductPhotoGallery title="Leeg product" paths={null} />
    <ProductPhotoEditor title="Leeg product" value={null} onChange={() => {}} />
  </QueryClientProvider>)).not.toThrow();
});