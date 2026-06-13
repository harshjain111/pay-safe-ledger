import { cn } from "@/lib/utils";
import { ReactNode } from "react";

/**
 * ONE status badge with fixed colour semantics:
 *   green = done / approved / paid / active
 *   amber = pending / needs action
 *   red   = rejected / failed / overdue
 *   grey  = neutral / draft
 *
 * Pass a `status` string (auto-mapped to a tone) or an explicit `tone`.
 * The legacy `variant` prop is kept as an alias so existing call sites keep
 * working — it is mapped onto the same four tones, so no other badge colours
 * can render.
 */

export type StatusTone = 'green' | 'amber' | 'red' | 'grey';

type LegacyVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info';

interface StatusBadgeProps {
  status?: string;
  tone?: StatusTone;
  /** @deprecated legacy alias — mapped to a tone for back-compat. */
  variant?: LegacyVariant;
  className?: string;
  children?: ReactNode;
}

const toneStyles: Record<StatusTone, { className: string; dot: string }> = {
  green: {
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  amber: {
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  red: {
    className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
  grey: {
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
};

// status string -> tone (lower-cased lookup; unknown statuses fall back to grey)
const STATUS_TONE: Record<string, StatusTone> = {
  approved: 'green',
  paid: 'green',
  reimbursed: 'green',
  settled: 'green',
  active: 'green',
  completed: 'green',
  done: 'green',
  success: 'green',
  present: 'green',

  pending: 'amber',
  submitted: 'amber',
  processing: 'amber',
  awaiting: 'amber',
  partial: 'amber',
  half_day: 'amber',

  rejected: 'red',
  failed: 'red',
  overdue: 'red',
  expired: 'red',
  error: 'red',
  absent: 'red',

  draft: 'grey',
  inactive: 'grey',
  cancelled: 'grey',
  canceled: 'grey',
  neutral: 'grey',
  unknown: 'grey',
};

// legacy variant -> tone (info/default folded in; no blue/indigo survives)
const VARIANT_TONE: Record<LegacyVariant, StatusTone> = {
  success: 'green',
  info: 'green',
  warning: 'amber',
  destructive: 'red',
  secondary: 'grey',
  default: 'grey',
};

function humanize(s?: string): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, tone, variant, className, children }: StatusBadgeProps) {
  const resolvedTone: StatusTone =
    tone ??
    (variant ? VARIANT_TONE[variant] : undefined) ??
    (status ? STATUS_TONE[status.toLowerCase()] : undefined) ??
    'grey';

  const style = toneStyles[resolvedTone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium',
        style.className,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {children ?? humanize(status)}
    </span>
  );
}
