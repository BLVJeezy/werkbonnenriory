import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/use-role";

export function useFinanceAuth() {
  const role = useRole();
  const session = useQuery({ queryKey: ["finance-user"], queryFn: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } });
  return { user: role === "admin" ? session.data ?? null : null, loading: role === null || session.isPending };
}