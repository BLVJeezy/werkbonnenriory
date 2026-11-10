import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Perms = { showPrices: boolean; showContact: boolean; canPayment: boolean; showSigned: boolean };
const ALL: Perms = { showPrices: true, showContact: true, canPayment: true, showSigned: true };

function useMe() {
  return useQuery({
    queryKey: ["my_role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { role: "technician" as const, perms: { ...ALL, showPrices: false, showContact: false, canPayment: false, showSigned: false }, largeText: false };
      const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      // A failed role read must not silently downgrade someone to crew.
      if (error) throw error;
      if (roles?.some((r) => r.role === "admin")) return { role: "admin" as const, perms: ALL, largeText: false };
      if (roles?.some((r) => r.role === "marketing")) return { role: "marketing" as const, perms: { showPrices: false, showContact: true, canPayment: false, showSigned: false }, largeText: false };
      const { data: t } = await supabase
        .from("technicians")
        .select("show_prices, show_contact, can_payment, show_signed, large_text")
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
        largeText: !!t?.large_text,
      };
    },
  });
}

/** Role of the signed-in user: "admin" or "technician" (null while loading). */
export function useRole() {
  return useMe().data?.role ?? null;
}

/** True when the role could not be loaded (after retries). */
export function useRoleError(): boolean {
  const q = useMe();
  return q.isError && !q.data;
}

/** What the signed-in crew may see/do; admins get everything. */
export function usePerms(): Perms | null {
  return useMe().data?.perms ?? null;
}

/** Whether the admin switched on extra large letters for this crew. */
export function useLargeText(): boolean {
  return useMe().data?.largeText ?? false;
}
