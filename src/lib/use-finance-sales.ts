import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncWerkbonnenSales } from "@/lib/finance-sales.functions";

/** Shared automatic local sales connection, independent of the purchase provider. */
export function useFinanceSales(enabled: boolean) {
  const sync = useServerFn(syncWerkbonnenSales);
  const qc = useQueryClient();
  const result = useQuery({
    queryKey: ["finance-local-sales"],
    queryFn: () => sync(),
    enabled,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    if (result.data?.ok && (result.data.nieuw || result.data.bijgewerkt)) {
      void qc.invalidateQueries({ queryKey: ["fin"] });
    }
  }, [result.data, qc]);
  return result;
}