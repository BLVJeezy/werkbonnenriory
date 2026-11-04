import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mergeSyndicusDir,
  syndicusDirPatch,
  syndicusKey,
  type SyndicusDir,
  type SyndicusDirInput,
} from "./syndici";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!admin) throw new Error("Alleen voor beheerder");
}

/** De fiche met dezelfde naam, hoe ze ook geschreven is (dubbele fiche's voorkomen). */
async function cardByName(supabase: any, name: string, exceptId?: string | null): Promise<SyndicusDir | null> {
  const { data, error } = await supabase.from("syndici").select("id, company");
  if (error) throw new Error(error.message);
  const key = syndicusKey(name);
  return ((data ?? []) as SyndicusDir[]).find((r) => r.id !== exceptId && syndicusKey(r.company) === key) ?? null;
}

export const saveSyndicus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null } & SyndicusDirInput) => {
    syndicusDirPatch(i);
    return i;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch = syndicusDirPatch(data);
    const dupe = await cardByName(context.supabase, patch.company, data.id ?? null);
    if (dupe) throw new Error(`Er is al een contactfiche voor ${dupe.company}.`);
    if (data.id) {
      const { error } = await context.supabase
        .from("syndici")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id as string, created: false };
    }
    const { data: row, error } = await context.supabase.from("syndici").insert(patch).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "Er is al een contactfiche voor deze syndicus." : error.message);
    return { id: row.id as string, created: true };
  });

export const deleteSyndicus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => {
    if (!i.id) throw new Error("Kies eerst een syndicus.");
    return i;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("syndici").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Na een bewerkte klant: de gegevens die daar bij de syndicus staan, terug op de
 * contactfiche zetten. Lege velden overschrijven niets, een fiche zonder naam
 * wordt niet bijgemaakt, en een gewiste syndicus op één klant laat de fiche staan.
 */
export const syncSyndicusFromCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: SyndicusDirInput) => i)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (!data.company?.trim()) return { ok: false as const };
    const incoming = syndicusDirPatch(data);
    const existing = await cardByName(context.supabase, incoming.company);
    if (!existing) {
      const { error } = await context.supabase.from("syndici").insert(incoming);
      if (error) throw new Error(error.message);
      return { ok: true as const, created: true };
    }
    const { data: full, error: readError } = await context.supabase
      .from("syndici")
      .select("*")
      .eq("id", existing.id)
      .single();
    if (readError) throw new Error(readError.message);
    const merged = mergeSyndicusDir(full as SyndicusDir, incoming);
    const { error } = await context.supabase
      .from("syndici")
      .update({ ...merged, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, created: false };
  });
