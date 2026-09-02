import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pattern 9 — the persistent grey rule note that sits under a filter bar,
 * e.g. "Finalized months are locked. De-finalize from Finalized Payroll to
 * make changes."
 */
export function InlineNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground', className)}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
