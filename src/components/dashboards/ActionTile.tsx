import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronRight, CheckCircle2 } from 'lucide-react';

export interface ActionTileProps {
  title: string;
  count: number;
  subtitle?: string;
  amount?: number;
  icon: LucideIcon;
  href: string;
  variant?: 'default' | 'warning' | 'success' | 'info';
  emptyMessage?: string;
  showAmountWhenZero?: boolean;
}

const variantStyles = {
  default: {
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
  warning: {
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    badge: 'bg-destructive text-destructive-foreground',
  },
  success: {
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-500/10 text-emerald-600',
  },
  info: {
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badge: 'bg-primary/10 text-primary',
  },
};

export function ActionTile({
  title,
  count,
  subtitle,
  amount,
  icon: Icon,
  href,
  variant = 'default',
  emptyMessage = 'All caught up',
  showAmountWhenZero = false,
}: ActionTileProps) {
  const navigate = useNavigate();
  const isEmpty = count === 0;
  const styles = isEmpty ? variantStyles.default : variantStyles[variant];

  const handleClick = () => {
    if (!isEmpty) {
      navigate(href);
    }
  };

  return (
    <Card
      className={cn(
        'rounded-2xl shadow-card border-0 transition-all duration-200',
        isEmpty
          ? 'opacity-60 cursor-default'
          : 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
      )}
      onClick={handleClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4 lg:gap-5">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 overflow-hidden">
            <div className={cn('p-2.5 sm:p-3 rounded-xl shrink-0', styles.iconBg)}>
              <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', styles.iconColor)} />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-xs sm:text-sm lg:text-base font-medium text-muted-foreground">
                {title}
              </p>
              <div className="flex items-center gap-2 mt-0.5 sm:mt-1 flex-wrap">
                {isEmpty ? (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm lg:text-base">{emptyMessage}</span>
                  </div>
                ) : (
                  <>
                    <span className="text-xl sm:text-2xl lg:text-3xl font-bold">{count}</span>
                    <Badge className={cn('text-[10px] sm:text-xs lg:text-sm px-1.5 sm:px-2', styles.badge)}>
                      Action needed
                    </Badge>
                  </>
                )}
              </div>
              {subtitle && !isEmpty && (
                <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground mt-0.5 sm:mt-1">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 sm:gap-2 shrink-0 text-right">
            {(amount !== undefined && (count > 0 || showAmountWhenZero)) && (
              <Amount 
                value={amount} 
                size="sm" 
                className={cn(
                  'font-semibold text-sm sm:text-base lg:text-lg',
                  isEmpty ? 'text-muted-foreground' : ''
                )} 
              />
            )}
            {!isEmpty && (
              <span className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground flex items-center gap-0.5 sm:gap-1 whitespace-nowrap">
                Click to view
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
