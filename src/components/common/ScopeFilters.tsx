import { useEffect, useMemo, useState } from 'react';
import { fetchActiveMaster } from '@/lib/masters-cache';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// Shared "which staff am I looking at" filters — department and outlet.
// Used by the leave screens so scoping works the same way everywhere.

export const SCOPE_ALL = 'all';
/** Sentinel for "staff with no department / no outlet set". */
export const SCOPE_NONE = '__none__';

export interface StaffScope {
  department: string;
  outletId: string;
}

export const EMPTY_SCOPE: StaffScope = { department: SCOPE_ALL, outletId: SCOPE_ALL };

export interface ScopedStaff {
  department?: string | null;
  outlet_id?: string | null;
}

/** True when a staff row falls inside the chosen department + outlet scope. */
export function scopeMatches(scope: StaffScope, s: ScopedStaff | undefined | null): boolean {
  if (!s) return scope.department === SCOPE_ALL && scope.outletId === SCOPE_ALL;
  const dept = (s.department ?? '').trim();
  if (scope.department !== SCOPE_ALL) {
    if (scope.department === SCOPE_NONE ? dept !== '' : dept !== scope.department) return false;
  }
  if (scope.outletId !== SCOPE_ALL) {
    const outlet = s.outlet_id ?? null;
    if (scope.outletId === SCOPE_NONE ? outlet !== null : outlet !== scope.outletId) return false;
  }
  return true;
}

export function isScopeActive(scope: StaffScope): boolean {
  return scope.department !== SCOPE_ALL || scope.outletId !== SCOPE_ALL;
}

/**
 * Department + Outlet selects. Department options are derived from the staff
 * rows the page already holds (so they always match the data on screen);
 * outlets come from the outlets master.
 */
export function ScopeFilters({
  staff,
  value,
  onChange,
  showClear = true,
}: {
  staff: ScopedStaff[];
  value: StaffScope;
  onChange: (next: StaffScope) => void;
  showClear?: boolean;
}) {
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchActiveMaster('outlets').catch(() => []);
      if (!cancelled) setOutlets(rows);
    })();
    return () => { cancelled = true; };
  }, []);

  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => (s.department ?? '').trim()).filter(Boolean))).sort(),
    [staff],
  );

  return (
    <>
      <Select value={value.department} onValueChange={(v) => onChange({ ...value, department: v })}>
        <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="All departments" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SCOPE_ALL}>All departments</SelectItem>
          <SelectItem value={SCOPE_NONE}>— No department —</SelectItem>
          {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.outletId} onValueChange={(v) => onChange({ ...value, outletId: v })}>
        <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder="All outlets" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SCOPE_ALL}>All outlets</SelectItem>
          <SelectItem value={SCOPE_NONE}>— No outlet —</SelectItem>
          {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {showClear && isScopeActive(value) && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange(EMPTY_SCOPE)}>
          Clear filters
        </Button>
      )}
    </>
  );
}
