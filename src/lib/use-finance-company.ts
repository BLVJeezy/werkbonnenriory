import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rioryCompanies } from "@/lib/finance-company-scope";

const selectionKey = ["fin-selected-company"];

export function resolveFinanceCompany(companies: { id: string }[], selected: string): string {
  return companies.some((company) => company.id === selected) ? selected : companies[0]?.id ?? "";
}

/** The shared query cache keeps the active company across Finance/accounting navigation. */
export function useFinanceCompany(enabled: boolean) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const companies = useQuery({
    queryKey: ["fin-companies"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").ilike("name", "Riory BV").order("name");
      if (error) throw error;
      return rioryCompanies(data ?? []);
    },
  });
  useEffect(() => {
    if (!companies.data) return;
    const next = resolveFinanceCompany(companies.data, companyId || qc.getQueryData<string>(selectionKey) || "");
    if (next !== companyId) setCompanyId(next);
  }, [companies.data, companyId, qc]);
  const selectCompany = (id: string) => {
    const next = resolveFinanceCompany(companies.data ?? [], id);
    qc.setQueryData(selectionKey, next);
    setCompanyId(next);
  };
  return { companies, companyId, selectCompany };
}