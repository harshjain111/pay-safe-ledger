import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface AppCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Optional header icon, shown in a rounded chip. */
  icon?: LucideIcon;
  /** Chip colour classes. Defaults to neutral — NEVER the brand accent
   *  (the accent is reserved for primary actions + active nav). */
  iconChip?: string;
  /** Header right slot (e.g. a button or filter). */
  actions?: React.ReactNode;
  /** Footer slot (e.g. confirm/cancel). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Padding from the 4/8px scale: 'sm' = 16px, 'md' = 16/24px responsive. */
  padding?: 'sm' | 'md';
}

const NEUTRAL_CHIP = 'bg-muted text-muted-foreground';

/**
 * The one composite card: header (optional icon-chip + title + description +
 * actions), body, optional footer. Built on the base <Card> so radius, border
 * and shadow stay single-sourced. All spacing comes from the 4/8px scale.
 */
export function AppCard({
  title,
  description,
  icon: Icon,
  iconChip,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  padding = 'md',
}: AppCardProps) {
  const pad = padding === 'sm' ? 'p-4' : 'p-4 sm:p-6';
  const hasHeader = title || description || Icon || actions;

  return (
    <Card className={cn('flex flex-col', className)}>
      {hasHeader && (
        <div className={cn('flex items-start justify-between gap-4', pad, (children || footer) && 'pb-4')}>
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div className={cn('shrink-0 rounded-xl p-2.5', iconChip ?? NEUTRAL_CHIP)}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      {children && (
        <div className={cn(pad, hasHeader && 'pt-0', 'flex-1', bodyClassName)}>{children}</div>
      )}

      {footer && (
        <div className={cn('flex items-center gap-2', pad, (hasHeader || children) && 'pt-0')}>
          {footer}
        </div>
      )}
    </Card>
  );
}
