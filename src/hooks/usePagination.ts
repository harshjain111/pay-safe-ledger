import { useEffect, useMemo, useState } from 'react';

/** Page sizes offered by <Paginator>. */
export const PAGE_SIZES = [10, 20, 50, 100];

/**
 * The arithmetic behind <Paginator>, including the part that is easy to get
 * wrong: when a filter shrinks the list under you the current page can fall
 * off the end. This clamps, and resets to the first page whenever the row
 * count changes, so filtering never lands you on a blank page 7 of 3.
 */
export function usePagination<T>(rows: T[], defaultPageSize = 20) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => { setPage(0); }, [total]);

  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  );

  return {
    pageRows,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (n: number) => { setPageSize(n); setPage(0); },
    pageCount,
    total,
    firstShown: total === 0 ? 0 : safePage * pageSize + 1,
    lastShown: Math.min(total, (safePage + 1) * pageSize),
  };
}
