import * as React from 'react';
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type ColorVariant = 'blue' | 'purple' | 'orange' | 'green' | 'pink' | 'cyan';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  color?: ColorVariant;
  className?: string;
  loading?: boolean;
}

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, subtitle, icon: Icon, trend, variant = 'default', color = 'blue', className, loading = false }, ref) => {
    const colorStyles: Record<ColorVariant, { icon: string; indicator: string }> = {
      blue: {
        icon: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
        indicator: 'bg-blue-500',
      },
      purple: {
        icon: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
        indicator: 'bg-purple-500',
      },
      orange: {
        icon: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
        indicator: 'bg-orange-500',
      },
      green: {
        icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
        indicator: 'bg-emerald-500',
      },
      pink: {
        icon: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400',
        indicator: 'bg-pink-500',
      },
      cyan: {
        icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
        indicator: 'bg-cyan-500',
      },
    };

    const variantStyles = {
      default: 'bg-card',
      primary: 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white',
      success: 'bg-gradient-to-br from-emerald-500 to-green-600 text-white',
      warning: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
      destructive: 'bg-gradient-to-br from-red-500 to-rose-600 text-white',
    };

    const isGradient = variant !== 'default';

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-2xl p-4 sm:p-6 transition-all duration-300 hover-scale overflow-hidden',
          'shadow-card hover:shadow-card-hover',
          variantStyles[variant],
          className
        )}
      >
        {/* Colored indicator bar */}
        {!isGradient && (
          <div className={cn(
            'absolute left-0 top-0 w-1 h-full rounded-l-2xl',
            colorStyles[color].indicator
          )} />
        )}

        {/* Background decoration for gradient cards */}
        {isGradient && (
          <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        )}

        <div className="relative flex items-start justify-between gap-2 sm:gap-4">
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className={cn(
              'text-xs sm:text-sm font-medium',
              isGradient ? 'text-white/80' : 'text-muted-foreground'
            )}>
              {title}
            </p>
            <p
              className={cn(
                'mt-1 sm:mt-2 text-xl sm:text-2xl lg:text-3xl font-bold tabular-nums tracking-tight truncate',
                isGradient ? 'text-white' : 'text-foreground'
              )}
              title={!loading ? String(value) : undefined}
            >
              {loading ? (
                <span
                  className={cn(
                    'inline-block h-[1em] w-20 sm:w-28 align-middle rounded animate-pulse',
                    isGradient ? 'bg-white/30' : 'bg-muted-foreground/20'
                  )}
                />
              ) : (
                value
              )}
            </p>
            {subtitle && (
              <p className={cn(
                'mt-1 text-[10px] sm:text-xs lg:text-sm truncate',
                isGradient ? 'text-white/70' : 'text-muted-foreground'
              )}>
                {loading ? ' ' : subtitle}
              </p>
            )}
            {trend && (
              <div className="mt-3 flex items-center gap-1.5 text-sm">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  trend.value >= 0 
                    ? isGradient ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : isGradient ? 'bg-white/20 text-white' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                )}>
                  {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
                </span>
                <span className={cn(
                  'text-xs',
                  isGradient ? 'text-white/60' : 'text-muted-foreground'
                )}>
                  {trend.label}
                </span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'rounded-lg sm:rounded-xl p-2 sm:p-3 flex-shrink-0',
              isGradient ? 'bg-white/20' : colorStyles[color].icon
            )}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          )}
        </div>
      </div>
    );
  }
);

StatCard.displayName = 'StatCard';
