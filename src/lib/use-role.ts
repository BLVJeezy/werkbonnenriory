import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Perms = { showPrices: boolean; showContact: boolean; canPayment: boolean; showSigned: boolean };
const ALL: Perms = { showPrices: true, showContact: true, canPayment: true, showSigned: true };

function useMe() {
  return useQuery({
    queryKey: ["my_role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { role: "technician" as const, perms: { ...ALL, showPrices: false, showContact: false, canPayment: false, showSigned: false } };
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (roles?.some((r) => r.role === "admin")) return { role: "admin" as const, perms: ALL };
      const { data: t } = await supabase
        .from("technicians")
        .select("show_prices, show_contact, can_payment, show_signed")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return {
        role: "technician" as const,
        perms: {
          showPrices: !!t?.show_prices,
          showContact: !!t?.show_contact,
          canPayment: !!t?.can_payment,
          showSigned: !!t?.show_signed,
        },
      };
    },
  });
}

/** Role of the signed-in user: "admin" or "technician" (null while loading). */
export function useRole() {
  return useMe().data?.role ?? null;
}

/** What the signed-in crew may see/do; admins get everything. */
export function usePerms(): Perms | null {
  return useMe().data?.perms ?? null;
}
