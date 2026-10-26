import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Role of the signed-in user: "admin" or "technician" (null while loading). */
export function useRole() {
  const { data } = useQuery({
    queryKey: ["my_role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return "technician" as const;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return roles?.some((r) => r.role === "admin") ? ("admin" as const) : ("technician" as const);
    },
  });
  return data ?? null;
}
