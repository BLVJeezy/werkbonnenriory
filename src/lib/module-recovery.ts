/** A failed or obsolete lazy route export can occur during a version change. */
export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(message)
    || (/undefined is not an object|Cannot read properties of undefined/i.test(message)
      && /lazyRouteComponent|e\[t\?\?/.test(message));
}

export function reloadForModuleError(error: unknown): boolean {
  if (typeof window === "undefined" || !isModuleLoadError(error)) return false;
  try {
    const key = "riory-chunk-reload";
    const last = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    // Blocked browser storage must not crash recovery or cause a reload loop.
    return false;
  }
}