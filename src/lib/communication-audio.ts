export const COMMUNICATION_AUDIO_BUCKET = "customer-communications-audio";
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const SIGNED_PLAYBACK_TTL_SECONDS = 60;

export const ALLOWED_AUDIO_MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/x-m4a": ["m4a"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
  "audio/ogg": ["ogg"],
  "audio/webm": ["webm"],
};

export const ALLOWED_AUDIO_MIME_TYPES = Object.keys(ALLOWED_AUDIO_MIME_EXTENSIONS);
export const AUDIO_FILE_ACCEPT = ".mp3,.m4a,.mp4,.wav,.ogg,.webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm";

export const COMMUNICATION_SCOPE_NOTES = {
  mailIncluded: ["info@riory.be", "afspraak@riory.be", "boekhouding@riory.be", "yordi@riory.be"],
  mailExcluded: ["support@ (Invenix-reviews)", "Syncro19"],
  mailSyncEnabled: false,
  telavoxConfirmed: false,
} as const;

export type AudioReadinessState = {
  ready: boolean;
  featureEnabled: boolean;
  retentionPolicyApproved: boolean;
  schemaReady: boolean;
  blockers: string[];
};

export function isAllowedCommunicationRole(roles: readonly string[]): boolean {
  return roles.includes("admin");
}

export function evaluateAudioReadiness(input: {
  featureEnabled: boolean;
  retentionPolicyApproved: boolean;
  schemaReady: boolean;
}): AudioReadinessState {
  const blockers: string[] = [];
  if (!input.featureEnabled) {
    blockers.push("Functievlag voor audio-opslag staat standaard uit in afwachting van beveiligingsreview.");
  }
  if (!input.retentionPolicyApproved) {
    blockers.push("Er is nog geen goedgekeurd bewaartermijnbeleid ingesteld; geen automatische retentie actief.");
  }
  if (!input.schemaReady) {
    blockers.push("Conceptmigratie en privé-opslagbucket zijn nog niet toegepast in de database.");
  }
  return {
    ready: blockers.length === 0,
    featureEnabled: input.featureEnabled,
    retentionPolicyApproved: input.retentionPolicyApproved,
    schemaReady: input.schemaReady,
    blockers,
  };
}

export function validateAudioUploadMeta(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  lawfulBasisConfirmed: boolean;
}): { ok: true; ext: string; mimeType: string } | { ok: false; error: string } {
  if (!input.lawfulBasisConfirmed) {
    return { ok: false, error: "Bevestig eerst dat het gesprek rechtmatig is opgenomen." };
  }

  const mime = input.mimeType.trim().toLowerCase();
  const allowedExts = ALLOWED_AUDIO_MIME_EXTENSIONS[mime];
  if (!allowedExts) {
    return { ok: false, error: "Bestandstype niet toegestaan. Gebruik MP3, M4A, WAV, OGG of WebM." };
  }

  const ext = input.fileName.trim().toLowerCase().split(".").pop() ?? "";
  if (!ext || !allowedExts.includes(ext)) {
    return { ok: false, error: "Bestandsextensie komt niet overeen met het audiobestandstype." };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "Audiobestand is leeg." };
  }

  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return { ok: false, error: "Audiobestand is groter dan het maximum van 25 MB." };
  }

  return { ok: true, ext, mimeType: mime };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildCommunicationStoragePath(
  customerId: string,
  communicationId: string,
  ext: string,
): string {
  if (!UUID_RE.test(customerId) || !UUID_RE.test(communicationId)) {
    throw new Error("Ongeldige klant- of communicatie-ID voor opslagpad.");
  }
  const cleanExt = ext.trim().toLowerCase();
  if (!/^[a-z0-9]{2,5}$/.test(cleanExt)) {
    throw new Error("Ongeldige bestandsextensie.");
  }
  return `${customerId}/${communicationId}.${cleanExt}`;
}

export function validateCommunicationOwnership(input: {
  customerId: string;
  workOrderId?: string | null;
  workOrderCustomerId?: string | null;
  projectId?: string | null;
  projectCustomerId?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!UUID_RE.test(input.customerId)) {
    return { ok: false, error: "Ongeldige klant-ID." };
  }
  if (input.workOrderId && input.workOrderCustomerId !== input.customerId) {
    return { ok: false, error: "Gekozen werkbon hoort niet bij deze klant." };
  }
  if (input.projectId && input.projectCustomerId !== input.customerId) {
    return { ok: false, error: "Gekozen project hoort niet bij deze klant." };
  }
  return { ok: true };
}