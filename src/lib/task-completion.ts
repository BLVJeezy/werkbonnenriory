/** A saved completion must return the crew home even when customer mail fails. */
export async function completeTask(actions: {
  save: () => Promise<boolean>;
  mail: () => Promise<void>;
  afterSaved: () => void | Promise<void>;
}) {
  if (!await actions.save()) return false;
  try {
    await actions.mail();
  } finally {
    await actions.afterSaved();
  }
  return true;
}