import { cn } from "@/lib/utils";
import { RequestStatus, SettlementStatus, ExpenseStatus } from "@/types/database";
import { ReactNode } from "react";

type StatusType = RequestStatus | SettlementStatus | ExpenseStatus | 'active' | 'inactive';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info';

interface StatusBadgeProps {
  status: StatusType;
  variant?: BadgeVariant;
  className?: string;
  children?: ReactNode;
}

const statusConfig: Record<StatusType, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
  settled: {
    label: 'Settled',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
  draft: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
  reimbursed: {
    label: 'Reimbursed',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
};

const variantConfig: Record<BadgeVariant, { className: string; dot: string }> = {
  default: {
    className: 'bg-primary/10 text-primary',
    dot: 'bg-primary',
  },
  secondary: {
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
  success: {
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  warning: {
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  destructive: {
    className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    dot: 'bg-red-500',
  },
  info: {
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
};

export function StatusBadge({ status, variant, className, children }: StatusBadgeProps) {
  const config = statusConfig[status];
  const variantStyle = variant ? variantConfig[variant] : null;
  const badgeClass = variantStyle?.className || config?.className;
  const dotClass = variantStyle?.dot || config?.dot;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium',
        badgeClass,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {children || config?.label || status}
    </span>
  );
}
