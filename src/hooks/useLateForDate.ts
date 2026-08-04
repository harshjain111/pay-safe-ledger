import { useQuery } from '@tanstack/react-query';
import { fetchLateForDate, type LateRow } from '@/lib/late';

/** Live "late arrivals" for a date (see src/lib/late.ts). */
export function useLateForDate(date: string, enabled = true, outletId?: string) {
  const q = useQuery({
    queryKey: ['late-for-date', date, outletId ?? 'all'],
    queryFn: () => fetchLateForDate(date, outletId),
    enabled,
    staleTime: 60_000,
  });
  return { rows: (q.data ?? []) as LateRow[], count: (q.data ?? []).length, isLoading: q.isLoading };
}
