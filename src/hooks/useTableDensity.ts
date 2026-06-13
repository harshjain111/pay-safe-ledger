import { useSyncExternalStore } from 'react';

export type TableDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'kcpl-table-density';

function read(): TableDensity {
  if (typeof window === 'undefined') return 'comfortable';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

// Module-level store so every DataTable shares one persisted preference and all
// instances re-render together when it changes.
let current: TableDensity = read();
const listeners = new Set<() => void>();

export function setTableDensity(d: TableDensity) {
  current = d;
  try {
    window.localStorage.setItem(STORAGE_KEY, d);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Global comfortable/compact table density, persisted in localStorage. */
export function useTableDensity() {
  const density = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'comfortable' as TableDensity,
  );
  return { density, setDensity: setTableDensity };
}
