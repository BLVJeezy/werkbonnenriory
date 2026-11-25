import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  COMMUNICATION_AUDIO_BUCKET,
  SIGNED_PLAYBACK_TTL_SECONDS,
  buildCommunicationStoragePath,
  evaluateAudioReadiness,
  validateAudioUploadMeta,
  validateCommunicationOwnership,
  type AudioReadinessState,
} from "@/lib/communication-audio";
import {
  normalizePhoneToE164,
  type CallDirection,
  type PhoneMatchStatus,
} from "@/lib/communication-phone";

export type CustomerCommunicationRow = {
  id: string;
  customer_id: string;
  work_order_id: string | null;
  project_id: string | null;
  direction: CallDirection;
  counterpart_phone_raw: string | null;
  counterpart_phone_e164: string | null;
  match_status: PhoneMatchStatus | "manual";
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  recorded_at: string | null;
  lawful_basis_confirmed: boolean;
  notes: string | null;
  created_at: string;
};

async function assertCommunicationAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) {
    throw new Error("Geen toegang: alleen Riory-beheerders mogen klantcommunicatie beheren.");
  }
}

async function checkReadiness(supabase: any): Promise<AudioReadinessState> {
  const featureEnabled = process.env["CUSTOMER_COMMUNICATIONS_AUDIO_ENABLED"] === "true";
  const retentionPolicyApproved =
    process.env["CUSTOMER_COMMUNICATIONS_RETENTION_POLICY_APPROVED"] === "true";

  let schemaReady = false;
  if (featureEnabled) {
    const { error } = await supabase.from("customer_communications").select("id").limit(1);
    schemaReady = !error;
  }

  return evaluateAudioReadiness({
    featureEnabled,
    retentionPolicyApproved,
    schemaReady,
  });
}

async function requireReady(supabase: any) {
  const readiness = await checkReadiness(supabase);
  if (!readiness.ready) {
    throw new Error(
      readiness.blockers[0] ??
        "Audio-opslag is momenteel uitgeschakeld in afwachting van migratie- en beveiligingsreview.",
    );
  }
}

async function verifyOwnershipOnServer(
  supabase: any,
  customerId: string,
  workOrderId: string | null,
  projectId: string | null,
) {
  let workOrderCustomerId: string | null = null;
  let projectCustomerId: string | null = null;

  if (workOrderId) {
    const { data: wo } = await supabase
      .from("work_orders")
      .select("customer_id")
      .eq("id", workOrderId)
      .maybeSingle();
    workOrderCustomerId = wo?.customer_id ?? null;
  }

  if (projectId) {
    const { data: proj } = await supabase
      .from("customer_projects")
      .select("customer_id")
      .eq("id", projectId)
      .maybeSingle();
    projectCustomerId = proj?.customer_id ?? null;
  }

  const check = validateCommunicationOwnership({
    customerId,
    workOrderId,
    workOrderCustomerId,
    projectId,
    projectCustomerId,
  });
  if (!check.ok) throw new Error(check.error);
}

async function recordAudit(
  supabase: any,
  entry: {
    communication_id: string;
    action: "upload" | "playback" | "download" | "ownership_change" | "delete";
    actor_user_id: string;
    previous_customer_id?: string | null;
    new_customer_id?: string | null;
    previous_work_order_id?: string | null;
    new_work_order_id?: string | null;
    previous_project_id?: string | null;
    new_project_id?: string | null;
  },
) {
  await supabase.from("customer_communication_audit").insert(entry);
}

/** Admin-only: checks whether audio storage/playback is enabled and ready. Fails closed by default. */
export const getCommunicationReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AudioReadinessState> => {
    await assertCommunicationAdmin(context);
    return checkReadiness(context.supabase);
  });

/** Admin-only: lists audio communications for a single customer. Fails closed when disabled. */
export const listCustomerCommunications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { customerId: string }) => i)
  .handler(async ({ data, context }): Promise<CustomerCommunicationRow[]> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);
    const { data: rows, error } = await db
      .from("customer_communications")
      .select(
        "id, customer_id, work_order_id, project_id, direction, counterpart_phone_raw, counterpart_phone_e164, match_status, storage_path, mime_type, size_bytes, duration_seconds, recorded_at, lawful_basis_confirmed, notes, created_at",
      )
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Opnames konden niet geladen worden.");
    return (rows ?? []) as CustomerCommunicationRow[];
  });

/** Admin-only: validates metadata, ownership, and returns a signed private upload path. */
export const prepareAudioUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      customerId: string;
      workOrderId: string | null;
      projectId: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      lawfulBasisConfirmed: boolean;
    }) => i,
  )
  .handler(async ({ data, context }): Promise<{ communicationId: string; storagePath: string }> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);

    const meta = validateAudioUploadMeta({
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      lawfulBasisConfirmed: data.lawfulBasisConfirmed,
    });
    if (!meta.ok) throw new Error(meta.error);

    await verifyOwnershipOnServer(db, data.customerId, data.workOrderId, data.projectId);

    const communicationId = crypto.randomUUID();
    const storagePath = buildCommunicationStoragePath(data.customerId, communicationId, meta.ext);
    return { communicationId, storagePath };
  });

/** Admin-only: registers an uploaded private audio file and writes an upload audit entry. */
export const registerCustomerAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      communicationId: string;
      customerId: string;
      workOrderId: string | null;
      projectId: string | null;
      direction: CallDirection;
      counterpartPhoneRaw: string | null;
      matchStatus: PhoneMatchStatus | "manual";
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      lawfulBasisConfirmed: boolean;
      notes: string | null;
    }) => i,
  )
  .handler(async ({ data, context }): Promise<CustomerCommunicationRow> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);

    const meta = validateAudioUploadMeta({
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      lawfulBasisConfirmed: data.lawfulBasisConfirmed,
    });
    if (!meta.ok) throw new Error(meta.error);

    const expectedPath = buildCommunicationStoragePath(data.customerId, data.communicationId, meta.ext);
    if (data.storagePath !== expectedPath) {
      throw new Error("Ongeldig opslagpad voor deze klant.");
    }

    await verifyOwnershipOnServer(db, data.customerId, data.workOrderId, data.projectId);

    const e164 = normalizePhoneToE164(data.counterpartPhoneRaw);
    const { data: row, error } = await db
      .from("customer_communications")
      .insert({
        id: data.communicationId,
        customer_id: data.customerId,
        work_order_id: data.workOrderId,
        project_id: data.projectId,
        direction: data.direction,
        counterpart_phone_raw: data.counterpartPhoneRaw?.trim() || null,
        counterpart_phone_e164: e164,
        match_status: data.matchStatus,
        storage_path: expectedPath,
        mime_type: meta.mimeType,
        size_bytes: data.sizeBytes,
        lawful_basis_confirmed: true,
        notes: data.notes?.trim().slice(0, 500) || null,
        uploaded_by: context.userId,
      })
      .select(
        "id, customer_id, work_order_id, project_id, direction, counterpart_phone_raw, counterpart_phone_e164, match_status, storage_path, mime_type, size_bytes, duration_seconds, recorded_at, lawful_basis_confirmed, notes, created_at",
      )
      .single();
    if (error || !row) throw new Error("Opname kon niet worden geregistreerd.");

    await recordAudit(db, {
      communication_id: data.communicationId,
      action: "upload",
      actor_user_id: context.userId,
      new_customer_id: data.customerId,
      new_work_order_id: data.workOrderId,
      new_project_id: data.projectId,
    });

    return row as CustomerCommunicationRow;
  });

/** Admin-only: issues a short-lived (60s) signed playback URL and audits the playback event. */
export const getAudioPlaybackUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { communicationId: string; customerId: string }) => i)
  .handler(async ({ data, context }): Promise<{ url: string; expiresInSeconds: number }> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);

    const { data: row } = await db
      .from("customer_communications")
      .select("id, customer_id, storage_path")
      .eq("id", data.communicationId)
      .eq("customer_id", data.customerId)
      .maybeSingle();
    if (!row) throw new Error("Opname niet gevonden voor deze klant.");

    const { data: signed, error } = await context.supabase.storage
      .from(COMMUNICATION_AUDIO_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_PLAYBACK_TTL_SECONDS);
    if (error || !signed?.signedUrl) {
      throw new Error("Privé-afspeellink kon niet worden aangemaakt.");
    }

    await recordAudit(db, {
      communication_id: row.id,
      action: "playback",
      actor_user_id: context.userId,
    });

    return { url: signed.signedUrl, expiresInSeconds: SIGNED_PLAYBACK_TTL_SECONDS };
  });

/** Admin-only: reassigns customer/work order/project ownership with server-side verification and audit. */
export const reassignCustomerCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      communicationId: string;
      newCustomerId: string;
      newWorkOrderId: string | null;
      newProjectId: string | null;
    }) => i,
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);

    const { data: existing } = await db
      .from("customer_communications")
      .select("id, customer_id, work_order_id, project_id")
      .eq("id", data.communicationId)
      .maybeSingle();
    if (!existing) throw new Error("Opname niet gevonden.");

    await verifyOwnershipOnServer(
      db,
      data.newCustomerId,
      data.newWorkOrderId,
      data.newProjectId,
    );

    const { error } = await db
      .from("customer_communications")
      .update({
        customer_id: data.newCustomerId,
        work_order_id: data.newWorkOrderId,
        project_id: data.newProjectId,
        match_status: "manual",
      })
      .eq("id", data.communicationId);
    if (error) throw new Error("Koppeling kon niet worden bijgewerkt.");

    await recordAudit(db, {
      communication_id: data.communicationId,
      action: "ownership_change",
      actor_user_id: context.userId,
      previous_customer_id: existing.customer_id,
      new_customer_id: data.newCustomerId,
      previous_work_order_id: existing.work_order_id,
      new_work_order_id: data.newWorkOrderId,
      previous_project_id: existing.project_id,
      new_project_id: data.newProjectId,
    });

    return { ok: true };
  });

/** Admin-only: deletes a private recording and audits the deletion. */
export const deleteCustomerCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { communicationId: string; customerId: string }) => i)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCommunicationAdmin(context);
    const db = context.supabase as any;
    await requireReady(db);

    const { data: existing } = await db
      .from("customer_communications")
      .select("id, customer_id, storage_path")
      .eq("id", data.communicationId)
      .eq("customer_id", data.customerId)
      .maybeSingle();
    if (!existing) throw new Error("Opname niet gevonden voor deze klant.");

    await recordAudit(db, {
      communication_id: existing.id,
      action: "delete",
      actor_user_id: context.userId,
      previous_customer_id: existing.customer_id,
    });

    if (existing.storage_path) {
      await context.supabase.storage.from(COMMUNICATION_AUDIO_BUCKET).remove([existing.storage_path]);
    }

    const { error } = await db
      .from("customer_communications")
      .delete()
      .eq("id", existing.id)
      .eq("customer_id", data.customerId);
    if (error) throw new Error("Opname kon niet worden verwijderd.");

    return { ok: true };
  });