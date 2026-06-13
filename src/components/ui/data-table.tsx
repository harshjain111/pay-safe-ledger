import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/EmptyState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Rows3,
  Rows4,
} from 'lucide-react';
import { useTableDensity, type TableDensity } from '@/hooks/useTableDensity';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  /** Stable id used for the sort state + React keys. */
  id: string;
  header: React.ReactNode;
  /** Cell renderer for a row. */
  cell: (row: T) => React.ReactNode;
  /** Mark the column sortable — clicking the header toggles asc/desc. */
  sortable?: boolean;
  /** Value used for client-side sorting (required for sortable columns). */
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Extra classes on the <th>. */
  headerClassName?: string;
  /** Extra classes on the <td> (e.g. min-w / truncate / font). */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;

  /** Initial page size; must be one of pageSizeOptions. Default 10. */
  pageSize?: number;
  pageSizeOptions?: number[];

  initialSort?: { columnId: string; direction: SortDirection };

  /** Right-aligned per-row actions (inline buttons or a kebab menu). */
  rowActions?: (row: T) => React.ReactNode;
  /** Header label for the actions column. Default: empty. */
  actionsHeader?: React.ReactNode;

  /** Slot rendered above the table — search + filters (B.5). */
  toolbar?: React.ReactNode;

  /** Shown (in place of the table body) when there are no rows. */
  emptyState?: React.ReactNode;

  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Override the global density preference (e.g. compact for data-heavy screens). */
  density?: TableDensity;

  /**
   * Server pagination. When provided, the table does NOT slice `data` itself —
   * the caller supplies the current page's rows and handles page changes. The
   * page-size selector is hidden in this mode (the server owns it).
   */
  serverPagination?: {
    page: number; // 1-based
    pageCount: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

const DEFAULT_PAGE_SIZES = [10, 25, 50];

const alignClass: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  data,
  rowKey,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  initialSort,
  rowActions,
  actionsHeader,
  toolbar,
  emptyState,
  isLoading = false,
  onRowClick,
  className,
  serverPagination,
  density: densityProp,
}: DataTableProps<T>) {
  const isServer = !!serverPagination;

  const { density: globalDensity, setDensity } = useTableDensity();
  const density = densityProp ?? globalDensity;
  const headDensity = density === 'compact' ? 'h-9' : '';
  const cellDensity = density === 'compact' ? 'py-1.5 text-sm' : '';

  const [sort, setSort] = React.useState<{ columnId: string; direction: SortDirection } | null>(
    initialSort ?? null
  );
  const [size, setSize] = React.useState<number>(pageSize);
  const [page, setPage] = React.useState(0); // 0-based (client mode)

  const sortedData = React.useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortAccessor) return data;
    const acc = col.sortAccessor;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls last
      if (vb == null) return -1;
      if (va instanceof Date || vb instanceof Date) {
        return (new Date(va as Date).getTime() - new Date(vb as Date).getTime()) * dir;
      }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [data, sort, columns]);

  // Reset to the first page whenever the dataset, sort or page-size changes.
  React.useEffect(() => {
    setPage(0);
  }, [data, sort, size]);

  const total = isServer ? serverPagination!.total : sortedData.length;
  const pageCount = isServer
    ? serverPagination!.pageCount
    : Math.max(1, Math.ceil(sortedData.length / size));
  const currentPage = isServer ? serverPagination!.page - 1 : Math.min(page, pageCount - 1);

  const pageRows = isServer
    ? sortedData
    : sortedData.slice(currentPage * size, currentPage * size + size);

  const start = total === 0 ? 0 : currentPage * size + 1;
  const end = isServer ? Math.min(currentPage * size + pageRows.length, total) : currentPage * size + pageRows.length;

  const goTo = (p: number) => {
    if (isServer) serverPagination!.onPageChange(p + 1);
    else setPage(Math.max(0, Math.min(p, pageCount - 1)));
  };

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    setSort((prev) => {
      if (!prev || prev.columnId !== col.id) return { columnId: col.id, direction: 'asc' };
      return { columnId: col.id, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const colSpan = columns.length + (rowActions ? 1 : 0);

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                {columns.map((col) => {
                  const active = sort?.columnId === col.id;
                  return (
                    <TableHead
                      key={col.id}
                      className={cn(
                        'whitespace-nowrap font-semibold text-foreground',
                        headDensity,
                        col.align && alignClass[col.align],
                        col.sortable && 'cursor-pointer select-none',
                        col.headerClassName
                      )}
                      onClick={col.sortable ? () => toggleSort(col) : undefined}
                      aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          col.align === 'right' && 'flex-row-reverse'
                        )}
                      >
                        {col.header}
                        {col.sortable &&
                          (active ? (
                            sort!.direction === 'asc' ? (
                              <ChevronUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                          ))}
                      </span>
                    </TableHead>
                  );
                })}
                {rowActions && (
                  <TableHead className={cn('text-right whitespace-nowrap font-semibold text-foreground', headDensity)}>
                    {actionsHeader}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colSpan} className="p-0">
                    <ListSkeleton variant="rows" />
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colSpan} className="p-0">
                    {emptyState ?? (
                      <EmptyState icon={Inbox} title="No results" description="Nothing matches the current view." />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    className={cn(
                      'even:bg-muted/30 hover:bg-muted/60 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        className={cn(cellDensity, col.align && alignClass[col.align], col.cellClassName)}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell
                        className={cn('text-right', cellDensity)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowActions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination footer */}
      {!isLoading && total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 px-1 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing <span className="font-medium text-foreground">{start}</span> to{' '}
              <span className="font-medium text-foreground">{end}</span> of{' '}
              <span className="font-medium text-foreground">{total}</span>
            </span>
            {!isServer && (
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Rows:</span>
                <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {pageSizeOptions.map((opt) => (
                      <SelectItem key={opt} value={String(opt)}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!densityProp && (
              <div className="hidden items-center gap-1 sm:flex">
                <span className="text-muted-foreground/60">·</span>
                <div className="inline-flex items-center rounded-lg border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setDensity('comfortable')}
                    aria-label="Comfortable rows"
                    aria-pressed={density === 'comfortable'}
                    className={cn(
                      'rounded-md p-1 transition-colors',
                      density === 'comfortable' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Rows3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    aria-label="Compact rows"
                    aria-pressed={density === 'compact'}
                    className={cn(
                      'rounded-md p-1 transition-colors',
                      density === 'compact' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Rows4 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {currentPage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous page"
              disabled={currentPage <= 0}
              onClick={() => goTo(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => goTo(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
