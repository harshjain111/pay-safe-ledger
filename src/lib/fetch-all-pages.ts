/**
 * Read every row of a bulk query, not just the first page.
 *
 * PostgREST caps a response at 1,000 rows. That cap is invisible — a truncated
 * result looks exactly like a complete one — and it bites precisely when a
 * per-staff query is replaced by one .in() query over everybody: August 2026
 * has 4,595 attendance rows across 214 staff, so an unpaged read returned the
 * first 1,000 and every employee after that computed as if they had never
 * attended. Each page is explicitly ordered so rows can't shift between
 * requests and be duplicated or skipped.
 */
const PAGE_SIZE = 1000;
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}
