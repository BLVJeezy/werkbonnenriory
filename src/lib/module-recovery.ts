/** Runs before the app imports: React effects cannot catch bootstrap failures. */
export const earlyModuleRecoveryScript = `(() => {
  const key = 'riory-chunk-reload';
  const recover = (message) => {
    const m = String(message);
    const stale = /Cannot read properties of undefined \\(reading 'component'\\)|undefined is not an object \\(evaluating '.*component/i.test(m) || (/Cannot read properties of undefined|undefined is not an object/i.test(m) && /lazyRouteComponent/.test(m));
    if (!stale && !/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(m)) return;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last >= 60000) {
        sessionStorage.setItem(key, String(Date.now()));
        location.reload();
        return;
      }
    } catch {}
    if (document.getElementById('riory-load-recovery')) return;
    const show = () => {
      const panel = document.createElement('section');
      panel.id = 'riory-load-recovery';
      panel.className = 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground';
      const title = document.createElement('h1');
      title.textContent = 'Riory Werkbonnen kon niet laden';
      title.className = 'text-xl font-bold';
      const text = document.createElement('p');
      text.textContent = 'De verbinding werd onderbroken. Probeer opnieuw.';
      const retry = document.createElement('a');
      retry.href = location.href;
      retry.textContent = 'Opnieuw laden';
      retry.className = 'rounded bg-primary px-4 py-3 font-semibold text-primary-foreground';
      retry.addEventListener('click', () => { try { sessionStorage.removeItem(key); } catch {} });
      panel.append(title, text, retry);
      document.body.append(panel);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
  };
  window.addEventListener('unhandledrejection', event => recover((event.reason?.message ?? event.reason) + '\\n' + (event.reason?.stack ?? '')));
  window.addEventListener('error', event => {
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.type === 'module') recover('Importing a module script failed');
    else recover(event.error?.message ?? event.message);
  }, true);
  window.addEventListener('vite:preloadError', event => { event.preventDefault(); recover('Importing a module script failed'); });
})();`;

/** A failed or obsolete lazy route export can occur during a version change. */
export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(message)
    || (/undefined is not an object|Cannot read properties of undefined/i.test(message)
      && /lazyRouteComponent|e\[t\?\?|reading 'component'/.test(message));
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