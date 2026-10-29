import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { noteAppEntry } from "./lib/cold-entry";

export const getRouter = () => {
  const queryClient = new QueryClient();
  if (typeof window !== "undefined") noteAppEntry(window.location.pathname);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
