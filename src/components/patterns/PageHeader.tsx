import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pattern 1 — the page header. "Title (count)" left, actions right, with an
 * optional one-line description under the title saying what the page is for.
 * Actions convention: outline buttons first, then exactly ONE primary button.
 * Identical geometry on every page — do not hand-roll page headers.
 */
export function PageHeader({
  title,
  description,
  count,
  actions,
  className,
}: {
  title: string;
  /** One line under the title saying what the page does. Omit to hide. */
  description?: string;
  /** Live row count shown as "(N)" in the accent colour. Omit to hide. */
  count?: number | null;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">
          {title}
          {count != null && <span className="ml-1.5 font-semibold text-primary">({count})</span>}
        </h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
