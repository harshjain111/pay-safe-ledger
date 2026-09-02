import { useMemo, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CellTone = 'positive' | 'negative' | undefined;

export interface DataTableColumn<T> {
  key: string;
  /** Header content — plain text or a <ConfigurableHeader>. */
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Money columns are right-aligned tabular numerals. */
  align?: 'left' | 'right' | 'center';
  /** Per-cell green/red tint. */
  cellTone?: (row: T) => CellTone;
  bold?: boolean;
  /** Fixed width in px — REQUIRED on sticky columns (used to compute offsets). */
  width?: number;
  headerClassName?: string;
}

const PAGE_SIZES = [10, 20, 50, 100];
const DEFAULT_STICKY_WIDTH = 180;
const CHECKBOX_COL_WIDTH = 40;

/**
 * Pattern 4 — the data table. Sticky left columns with a right shadow edge,
 * ~30px rows, tabular numerals, horizontal scroll INSIDE its own container
 * (the page body never scrolls sideways), a built-in "Showing X–Y of Z"
 * footer with a page-size select and pager, and an optional selection footer.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  stickyColumns = 0,
  selectable = false,
  selected,
  onSelectedChange,
  loading = false,
  empty,
  visibleColumnKeys,
  selectionSummary,
  defaultPageSize = 20,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Number of left columns frozen while the rest scroll. */
  stickyColumns?: number;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  loading?: boolean;
  /** Rendered when rows is empty and not loading (use <EmptyState>). */
  empty?: ReactNode;
  /** When provided (from <ColumnChooser>), only these column keys render. */
  visibleColumnKeys?: string[];
  /** Left side of the selection footer bar, e.g. "3 selected · Net ₹X". */
  selectionSummary?: ReactNode;
  defaultPageSize?: number;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const visible = useMemo(
    () => (visibleColumnKeys ? columns.filter((c) => visibleColumnKeys.includes(c.key)) : columns),
    [columns, visibleColumnKeys],
  );

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const firstShown = total === 0 ? 0 : safePage * pageSize + 1;
  const lastShown = Math.min(total, (safePage + 1) * pageSize);

  // Cumulative left offsets for sticky cells (checkbox column counts first).
  const stickyOffsets = useMemo(() => {
    const offsets: number[] = [];
    let left = selectable ? CHECKBOX_COL_WIDTH : 0;
    for (let i = 0; i < visible.length; i++) {
      offsets.push(left);
      left += visible[i].width ?? DEFAULT_STICKY_WIDTH;
    }
    return offsets;
  }, [visible, selectable]);

  const stickyStyle = (i: number): React.CSSProperties | undefined => {
    if (i >= stickyColumns) return undefined;
    const style: React.CSSProperties = {
      position: 'sticky',
      left: stickyOffsets[i],
      zIndex: 2,
      width: visible[i].width ?? DEFAULT_STICKY_WIDTH,
      minWidth: visible[i].width ?? DEFAULT_STICKY_WIDTH,
      maxWidth: visible[i].width ?? DEFAULT_STICKY_WIDTH,
    };
    if (i === stickyColumns - 1) style.boxShadow = '2px 0 4px -2px hsl(var(--foreground) / 0.18)';
    return style;
  };

  const pageKeys = pageRows.map(rowKey);
  const allPageSelected = selectable && pageKeys.length > 0 && pageKeys.every((k) => selected?.has(k));
  const toggleAllPage = () => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (allPageSelected) for (const k of pageKeys) next.delete(k);
    else for (const k of pageKeys) next.add(k);
    onSelectedChange(next);
  };
  const toggleRow = (key: string) => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };

  const alignClass = (c: DataTableColumn<T>) =>
    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left';
  const toneClass = (tone: CellTone) =>
    tone === 'positive' ? 'bg-success/10 text-success' : tone === 'negative' ? 'bg-destructive/10 text-destructive' : '';

  if (!loading && total === 0 && empty) {
    return <div className={cn('rounded-xl border bg-card', className)}>{empty}</div>;
  }

  return (
    <div className={cn('rounded-xl border bg-card', className)}>
      {/* The table scrolls horizontally inside its OWN container. */}
      <div className="overflow-x-auto" data-testid="datatable-scroll">
        <table className="w-full border-collapse text-sm [font-variant-numeric:tabular-nums]">
          <thead>
            <tr className="border-b bg-secondary/40">
              {selectable && (
                <th
                  className="bg-secondary px-2 py-1.5"
                  style={{ position: 'sticky', left: 0, zIndex: 3, width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH }}
                >
                  <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} aria-label="Select page" />
                </th>
              )}
              {visible.map((c, i) => (
                <th
                  key={c.key}
                  data-sticky={i < stickyColumns ? 'true' : undefined}
                  className={cn(
                    'whitespace-nowrap px-2.5 py-1.5 text-xs font-medium text-muted-foreground',
                    i < stickyColumns && 'bg-secondary',
                    alignClass(c),
                    c.headerClassName,
                  )}
                  style={{ ...(stickyStyle(i) ?? {}), ...(stickyStyle(i) ? { zIndex: 3 } : {}) }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r} className="h-[30px]">
                    {selectable && (
                      <td className="px-2 py-1"><Skeleton className="h-3.5 w-4" /></td>
                    )}
                    {visible.map((c) => (
                      <td key={c.key} className="px-2.5 py-1"><Skeleton className="h-3.5 w-full" /></td>
                    ))}
                  </tr>
                ))
              : pageRows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <tr key={key} className="h-[30px] hover:bg-muted/40">
                      {selectable && (
                        <td
                          className="bg-card px-2 py-0.5"
                          style={{ position: 'sticky', left: 0, zIndex: 2, width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH }}
                        >
                          <Checkbox
                            checked={selected?.has(key) ?? false}
                            onCheckedChange={() => toggleRow(key)}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {visible.map((c, i) => {
                        const tone = c.cellTone?.(row);
                        return (
                          <td
                            key={c.key}
                            data-sticky={i < stickyColumns ? 'true' : undefined}
                            className={cn(
                              'whitespace-nowrap px-2.5 py-0.5',
                              i < stickyColumns && 'bg-card',
                              alignClass(c),
                              c.bold && 'font-semibold',
                              toneClass(tone),
                            )}
                            style={stickyStyle(i)}
                          >
                            {c.render(row)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Selection footer bar. */}
      {selectable && (selected?.size ?? 0) > 0 && (
        <div className="flex items-center gap-3 border-t bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected!.size} selected</span>
          {selectionSummary}
        </div>
      )}

      {/* Standard footer: Showing X–Y of Z + page size + pager. */}
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>Showing {firstShown}–{lastShown} of {total}</span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-7 w-[4.5rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>{safePage + 1} / {pageCount}</span>
          <Button
            variant="outline" size="icon" className="h-7 w-7"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
