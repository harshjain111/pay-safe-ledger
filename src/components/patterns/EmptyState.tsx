import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pattern 8 — the empty state. The instruction MUST name the control the user
 * should use next (e.g. "Choose a date range above and press Search."), never
 * a bare "No data found."
 *
 * The single implementation: layout/EmptyState is an adapter onto this, so the
 * app has one empty state rather than two that drift apart.
 */
export function EmptyState({
  title,
  instruction,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  /** Actionable next step, naming the control to use. */
  instruction: string;
  icon?: ComponentType<{ className?: string }>;
  /** The control that resolves the emptiness, when there is one. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground/50" />}
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{instruction}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
