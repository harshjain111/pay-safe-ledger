import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_SIZES } from '@/hooks/usePagination';

// ---------------------------------------------------------------------------
// One pager, used everywhere.
//
// DataTable has had "Showing X–Y of Z" plus a page-size select since it was
// written, but every page built on a raw <Table> rendered its entire list —
// all 214 staff, every ledger entry, the whole audit log — so those screens
// just scrolled forever. This is DataTable's own footer lifted out so the two
// cannot drift: DataTable renders it too.
//
// The arithmetic lives in usePagination (src/hooks/usePagination.ts).
// ---------------------------------------------------------------------------

export interface PaginatorProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  firstShown: number;
  lastShown: number;
  setPage: (updater: (p: number) => number) => void;
  setPageSize: (n: number) => void;
  /** What is being counted, for the screen-reader label. */
  noun?: string;
  className?: string;
}

export function Paginator({
  page, pageCount, pageSize, total, firstShown, lastShown,
  setPage, setPageSize, noun = 'rows', className,
}: PaginatorProps) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground',
      className,
    )}>
      <span>Showing {firstShown}–{lastShown} of {total}</span>
      <div className="ml-auto flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-11 w-[4.5rem] text-xs sm:h-7" aria-label={`${noun} per page`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline" size="icon" className="h-11 w-11 sm:h-7 sm:w-7"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>{page + 1} / {pageCount}</span>
        <Button
          variant="outline" size="icon" className="h-11 w-11 sm:h-7 sm:w-7"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
