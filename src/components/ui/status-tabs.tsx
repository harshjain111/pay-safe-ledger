import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface StatusTab {
  value: string;
  label: string;
  /** Optional count shown as a small pill after the label. */
  count?: number;
}

interface StatusTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: StatusTab[];
  className?: string;
}

/** The standard Pending / Approved / Rejected / All set. */
export const DEFAULT_STATUS_TABS: StatusTab[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

/**
 * One consistent tab bar for every status-driven screen. The tab set is
 * configurable (some screens add Drafts/Paid), but the style is shared.
 */
export function StatusTabs({ value, onValueChange, tabs, className }: StatusTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn('w-full sm:w-auto', className)}>
      <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 sm:w-auto">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="flex-shrink-0 gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3"
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {t.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
