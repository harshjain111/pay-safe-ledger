import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight } from 'lucide-react';

export type DashboardCardTone = 'default' | 'accent' | 'muted';

/** Tinted headline tiles. The whole tile carries the colour, not just a chip —
 *  which is what separates the figures you check first from the detail below. */
export type DashboardCardTint = 'blue' | 'green' | 'amber' | 'violet';

const TINT: Record<DashboardCardTint, string> = {
  blue:   'bg-[hsl(var(--tile-blue))] text-[hsl(var(--tile-blue-ink))] border-transparent',
  green:  'bg-[hsl(var(--tile-green))] text-[hsl(var(--tile-green-ink))] border-transparent',
  amber:  'bg-[hsl(var(--tile-amber))] text-[hsl(var(--tile-amber-ink))] border-transparent',
  violet: 'bg-[hsl(var(--tile-violet))] text-[hsl(var(--tile-violet-ink))] border-transparent',
};

/** The icon chip inside a tinted tile: the tile ink at low opacity, so the two
 *  always agree instead of being picked separately at each call site. */
const TINT_CHIP = 'bg-current/10 text-current';

interface DashboardCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Icon-chip colour classes, e.g. 'bg-info/10 text-info'. */
  iconChip?: string;
  /** Makes the whole card a link. */
  href?: string;
  /** accent = needs attention (ring + emphasis); muted = caught up (recedes). */
  tone?: DashboardCardTone;
  /** Small pill shown under the value (e.g. "Action needed"). */
  badge?: React.ReactNode;
  /** Right-aligned extra (e.g. an Amount). */
  rightSlot?: React.ReactNode;
  /** Fills the whole tile with a soft tint (headline figures). */
  tint?: DashboardCardTint;
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
  tint,
  loading = false,
  className,
}: DashboardCardProps) {
  const interactive = !!href && tone !== 'muted';

  const body = (
    <div
      className={cn(
        'relative flex h-full items-start gap-3 rounded-2xl border p-4 sm:p-5 transition duration-200',
        tint ? TINT[tint] : 'bg-card',
        tone === 'accent' && 'border-primary/30 ring-1 ring-primary/10',
        tone === 'muted' && 'opacity-60',
        tone === 'default' && !tint && 'border-border',
        interactive && 'hover:shadow-card-hover hover:-translate-y-0.5',
        className
      )}
    >
      <div className={cn('shrink-0 rounded-xl p-2.5 sm:p-3', tint ? TINT_CHIP : (iconChip ?? DEFAULT_CHIP))}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-xs sm:text-sm font-medium', tint ? 'opacity-80' : 'text-muted-foreground')}>{label}</p>

        {loading ? (
          <span className="mt-1 inline-block h-7 w-20 animate-pulse rounded bg-muted-foreground/20" />
        ) : (
          <p className={cn('mt-0.5 sm:mt-1 truncate text-xl sm:text-2xl lg:text-3xl font-bold tabular-nums tracking-tight', !tint && 'text-foreground')}>
            {value}
          </p>
        )}

        {badge && !loading && <div className="mt-1">{badge}</div>}
        {subtitle && !loading && (
          <p className={cn('mt-1 truncate text-[10px] sm:text-xs', tint ? 'opacity-70' : 'text-muted-foreground')}>{subtitle}</p>
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
