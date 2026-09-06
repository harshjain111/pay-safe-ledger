import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// ---------------------------------------------------------------------------
// Route chunks that survive a deploy.
//
// Every page is a separate chunk with a content hash in its filename. When a
// new build goes out, those hashes change and the previous build's files stop
// being served. A tab that was opened BEFORE the deploy still holds the old
// index.html, so the first navigation to a page it hasn't loaded yet asks for
// a filename that no longer exists.
//
// Worse, vercel.json rewrites everything to /index.html, so the request does
// not 404 — it comes back 200 with an HTML body and Content-Type text/html.
// The browser refuses to run HTML as a module and import() rejects with
// "Failed to fetch dynamically imported module". That reached the app-wide
// error boundary and the user got "Something went wrong" on a page that is
// perfectly fine, simply because we had shipped while their tab was open.
//
// The fix is a reload: it fetches the current index.html and with it the
// current hashes. RELOAD_KEY makes that happen at most once per tab, so a
// genuine, persistent failure (the chunk is really broken, or the network is
// down) still surfaces as an error instead of a refresh loop.
// ---------------------------------------------------------------------------

const RELOAD_KEY = 'vibrnd-chunk-reload';

/** True for the "chunk is gone / came back as HTML" family of import errors. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||   // Safari
    /expected a javascript(-or-wasm)? module script/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

export function lazyRoute<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    load().catch((err: unknown) => {
      if (!isStaleChunkError(err)) throw err;

      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_KEY) !== null;
        if (!alreadyTried) sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // Private mode or blocked storage: fall through and rethrow rather
        // than reload, because without the guard we cannot promise it stops.
        throw err;
      }

      if (alreadyTried) throw err;

      window.location.reload();
      // The reload is asynchronous; hand back a promise that never settles so
      // React keeps showing the Suspense fallback rather than flashing an
      // error for the fraction of a second before the page goes away.
      return new Promise<{ default: T }>(() => {});
    }),
  );
}

/**
 * Clears the once-per-tab guard. Called after the app has successfully
 * rendered, so a tab that recovers from one deploy can also recover from the
 * next one without being reopened.
 */
export function clearChunkReloadGuard(): void {
  try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* nothing to clear */ }
}
