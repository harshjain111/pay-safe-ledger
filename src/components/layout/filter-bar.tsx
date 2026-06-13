import { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  /** LEFT: filter dropdowns / segmented controls. */
  filters?: ReactNode;
  /** RIGHT: the primary page action (e.g. "+ New Expense"). */
  action?: ReactNode;

  /** MIDDLE: built-in search input. Provide onSearchChange to show it. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Custom middle slot (overrides the built-in search). */
  search?: ReactNode;

  className?: string;
}

/**
 * One row, same everywhere: filters on the LEFT, search in the MIDDLE, primary
 * action on the RIGHT. Stacks vertically on small screens.
 */
export function FilterBar({
  filters,
  action,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  search,
  className,
}: FilterBarProps) {
  const middle =
    search ??
    (onSearchChange ? (
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search"
          placeholder={searchPlaceholder}
          value={searchValue ?? ''}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
    ) : null);

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      {middle && <div className="min-w-0 flex-1 sm:max-w-md">{middle}</div>}
      {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
    </div>
  );
}
