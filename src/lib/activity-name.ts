// Rules for renaming an activity in the rate management screen.

export type ActivityRename =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "unchanged" | "duplicate" };

/**
 * Validate a typed activity name before saving it.
 *
 * - the name is trimmed and may never be empty
 * - an unchanged name is not saved again
 * - another activity may already have the same name (case-insensitive),
 *   but the activity being renamed never counts as its own duplicate
 */
export function renameActivity(current: string, typed: string, allNames: string[]): ActivityRename {
  const name = typed.trim();
  if (!name) return { ok: false, reason: "empty" };
  if (name === current.trim()) return { ok: false, reason: "unchanged" };
  const self = current.trim().toLowerCase();
  const taken = allNames.some((n) => {
    const other = n.trim().toLowerCase();
    return other !== self && other === name.toLowerCase();
  });
  if (taken) return { ok: false, reason: "duplicate" };
  return { ok: true, name };
}
