export const PROCESSED_FOLDER = "Uitgevoerd";
export const OUTLOOK_MOVE_SCOPES = ["Mail.ReadWrite"];

export async function moveAppointmentMessage(
  graph: (path: string, init?: RequestInit) => Promise<Response>,
  sourceId: string,
  savedImmutableId: string | null,
  rememberId: (id: string) => Promise<void>,
) {
  const read = async (res: Response) => {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Appointment mail move failed [${res.status}]: ${body}`);
      throw new Error(`Afspraakmail verplaatsen mislukt (${res.status}). Probeer later opnieuw.`);
    }
    return res.json();
  };
  const folders = await read(await graph(`/me/mailFolders?$filter=displayName eq '${PROCESSED_FOLDER}'&$select=id,displayName`));
  if (folders.value.length > 1) throw new Error("Meerdere mappen Uitgevoerd gevonden; controleer de afspraakmailbox.");
  let folderId: string | undefined = folders.value[0]?.id;
  if (!folderId) {
    const created = await read(await graph("/me/mailFolders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: PROCESSED_FOLDER }) }));
    folderId = created.id;
  }
  if (!folderId) throw new Error("Map Uitgevoerd kon niet gevonden worden.");
  const message = await read(await graph(`/me/messages/${encodeURIComponent(savedImmutableId ?? sourceId)}?$select=id,parentFolderId`));
  // Persist a stable ID before moving: a retry can verify the folder even if the response was lost.
  await rememberId(message.id);
  if (message.parentFolderId === folderId) return;
  await read(await graph(`/me/messages/${encodeURIComponent(message.id)}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationId: folderId }) }));
}