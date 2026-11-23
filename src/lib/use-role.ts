import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Perms = { showPrices: boolean; showContact: boolean; canPayment: boolean; showSigned: boolean };
const ALL: Perms = { showPrices: true, showContact: true, canPayment: true, showSigned: true };
export type AllowedCrew = { id: string; name: string; color: string | null };

function useMe() {
  return useQuery({
    queryKey: ["my_role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const emptyCrews = { activeCrewId: null as string | null, allowedCrews: [] as AllowedCrew[] };
      if (!u.user) return { role: "technician" as const, perms: { ...ALL, showPrices: false, showContact: false, canPayment: false, showSigned: false }, largeText: false, ...emptyCrews };
      const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      // A failed role read must not silently downgrade someone to crew.
      if (error) throw error;
      if (roles?.some((r) => r.role === "admin")) return { role: "admin" as const, perms: ALL, largeText: false, ...emptyCrews };
      if (roles?.some((r) => r.role === "marketing")) return { role: "marketing" as const, perms: { showPrices: false, showContact: true, canPayment: false, showSigned: false }, largeText: false, ...emptyCrews };
      const { data: t } = await supabase
        .from("technicians")
        .select("show_prices, show_contact, can_payment, show_signed, large_text")
        .eq("user_id", u.user.id)
        .maybeSingle();
      let crew = t;
      let activeCrewId: string | null = null;
      let allowedCrews: AllowedCrew[] = [];
      if (!crew) {
        const { data: emp } = await supabase
          .from("tk_employees")
          .select("id, current_technician_id")
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (emp) {
          activeCrewId = emp.current_technician_id;
          const { data: links } = await supabase
            .from("tk_employee_crews")
            .select("technician_id")
            .eq("employee_id", emp.id);
          const ids = [...new Set([...(links ?? []).map((l) => l.technician_id), ...(emp.current_technician_id ? [emp.current_technician_id] : [])])];
          if (ids.length > 0) {
            const { data: list } = await supabase
              .from("technicians")
              .select("id, name, color, show_prices, show_contact, can_payment, show_signed, large_text")
              .in("id", ids)
              .order("name");
            allowedCrews = (list ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color }));
            crew = (list ?? []).find((c) => c.id === emp.current_technician_id) ?? null;
          }
        }
      }
      return {
        role: "technician" as const,
        perms: {
          showPrices: !!crew?.show_prices,
          showContact: !!crew?.show_contact,
          canPayment: !!crew?.can_payment,
          showSigned: !!crew?.show_signed,
        },
        largeText: !!crew?.large_text,
        activeCrewId,
        allowedCrews,
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

/** Allowed crews and currently active crew for an employee login. */
export function useEmployeeCrews(): { activeCrewId: string | null; allowedCrews: AllowedCrew[] } {
  const data = useMe().data;
  return { activeCrewId: data?.activeCrewId ?? null, allowedCrews: data?.allowedCrews ?? [] };
}
