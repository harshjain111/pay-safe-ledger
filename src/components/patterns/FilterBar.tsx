import { useState, type ReactNode } from 'react';
import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface DateRange {
  /** yyyy-MM-dd inclusive */
  from: string;
  /** yyyy-MM-dd inclusive */
  to: string;
}

/** Inclusive day count of a range; null when either end is missing/invalid. */
export function rangeDayCount(range: DateRange): number | null {
  if (!range.from || !range.to) return null;
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  if (!isValid(from) || !isValid(to) || to < from) return null;
  return differenceInCalendarDays(to, from) + 1;
}

/**
 * Pattern 2b — the date range field. Prints the inclusive day count
 * immediately beside the range, e.g. "01 Aug 2026 → 31 Aug 2026  31 Days".
 */
export function DateRangeField({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  className?: string;
}) {
  const days = rangeDayCount(value);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        type="date"
        aria-label="From date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="h-9 w-[9.5rem]"
      />
      <span className="text-muted-foreground">→</span>
      <Input
        type="date"
        aria-label="To date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="h-9 w-[9.5rem]"
      />
      {days != null && (
        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
          {days} Day{days === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

/**
 * Pattern 2 — the filter bar. Scope selects → DateRangeField → a primary
 * Search button, with a right-hand slot for <ActionsMenu>.
 *
 * CRITICAL: filters DO NOT auto-apply. This component owns the DRAFT filter
 * state and only lifts it via onSearch when the Search button is pressed —
 * nothing may query before that.
 */
export function FilterBar<F>({
  initial,
  onSearch,
  children,
  trailing,
  searchLabel = 'Search',
  className,
}: {
  /** Initial draft filter values. */
  initial: F;
  /** Called with the current draft ONLY when Search is pressed. */
  onSearch: (filters: F) => void;
  /** Render the scope fields from the draft. */
  children: (draft: F, setDraft: (next: F) => void) => ReactNode;
  /** Right-hand slot (typically <ActionsMenu>). */
  trailing?: ReactNode;
  searchLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<F>(initial);
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3', className)}>
      {children(draft, setDraft)}
      <Button onClick={() => onSearch(draft)} className="gap-1.5">
        <Search className="h-4 w-4" /> {searchLabel}
      </Button>
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  );
}
