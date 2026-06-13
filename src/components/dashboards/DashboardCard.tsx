import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight } from 'lucide-react';

export type DashboardCardTone = 'default' | 'accent' | 'muted';

interface DashboardCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Icon-chip colour classes, e.g. 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'. */
  iconChip?: string;
  /** Makes the whole card a link. */
  href?: string;
  /** accent = needs attention (ring + emphasis); muted = caught up (recedes). */
  tone?: DashboardCardTone;
  /** Small pill shown under the value (e.g. "Action needed"). */
  badge?: React.ReactNode;
  /** Right-aligned extra (e.g. an Amount). */
  rightSlot?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

const DEFAULT_CHIP = 'bg-muted text-muted-foreground';

/**
 * The single card used across every dashboard band — same radius, padding and
 * icon-chip. Renders as a div, or a Link when `href` is set.
 */
export function DashboardCard({
  icon: Icon,
  label,
  value,
  subtitle,
  iconChip,
  href,
  tone = 'default',
  badge,
  rightSlot,
  loading = false,
  className,
}: DashboardCardProps) {
  const interactive = !!href && tone !== 'muted';

  const body = (
    <div
      className={cn(
        'relative flex h-full items-start gap-3 rounded-2xl border bg-card p-4 sm:p-5 transition-all duration-200',
        tone === 'accent' && 'border-primary/30 ring-1 ring-primary/10',
        tone === 'muted' && 'opacity-60',
        tone === 'default' && 'border-border',
        interactive && 'hover:shadow-card-hover hover:-translate-y-0.5',
        className
      )}
    >
      <div className={cn('shrink-0 rounded-xl p-2.5 sm:p-3', iconChip ?? DEFAULT_CHIP)}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs sm:text-sm font-medium text-muted-foreground">{label}</p>

        {loading ? (
          <span className="mt-1 inline-block h-7 w-20 animate-pulse rounded bg-muted-foreground/20" />
        ) : (
          <p className="mt-0.5 sm:mt-1 truncate text-xl sm:text-2xl lg:text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
        )}

        {badge && !loading && <div className="mt-1">{badge}</div>}
        {subtitle && !loading && (
          <p className="mt-1 truncate text-[10px] sm:text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {rightSlot && !loading && (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">{rightSlot}</div>
      )}
      {interactive && (
        <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/50" />
      )}
    </div>
  );

  if (interactive) {
    return (
      <Link to={href!} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl">
        {body}
      </Link>
    );
  }
  return body;
}
