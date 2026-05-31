import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ListSkeletonProps {
  /** Number of placeholder rows to render. */
  rows?: number;
  /** `cards` for card-grid pages, `rows` for table/list pages inside a Card. */
  variant?: 'cards' | 'rows';
  className?: string;
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}

export function ListSkeleton({ rows = 6, variant = 'rows', className }: ListSkeletonProps) {
  if (variant === 'cards') {
    return (
      <div className={cn('grid gap-3 sm:gap-4', className)} aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3 sm:p-4">
              <SkeletonRow />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('divide-y', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-3 sm:p-4">
          <SkeletonRow />
        </div>
      ))}
    </div>
  );
}
