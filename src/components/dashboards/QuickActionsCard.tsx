import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LucideIcon, Zap } from 'lucide-react';

export interface QuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  variant?: 'primary' | 'secondary' | 'accent' | 'muted';
  badge?: number | string;
  badgeVariant?: 'default' | 'destructive' | 'success';
}

interface QuickActionsCardProps {
  actions: QuickAction[];
  title?: string;
  description?: string;
}

const variantStyles = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary text-secondary-foreground',
  accent: 'bg-accent/50 text-accent-foreground',
  muted: 'bg-muted text-muted-foreground',
};

const badgeVariantStyles = {
  default: 'bg-primary/20 text-primary',
  destructive: 'bg-destructive text-destructive-foreground',
  success: 'bg-emerald-500/20 text-emerald-600',
};

export function QuickActionsCard({
  actions,
  title = 'Quick Actions',
  description = 'Common tasks and shortcuts',
}: QuickActionsCardProps) {
  return (
    <Card className="rounded-2xl shadow-card border-0">
      <CardHeader className="pb-2 px-4 sm:px-6">
        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:gap-3 px-4 sm:px-6">
        {actions.map((action) => (
          <Link key={action.href} to={action.href}>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 sm:py-4 rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div
                className={cn(
                  'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mr-2 sm:mr-3 shrink-0',
                  variantStyles[action.variant || 'primary']
                )}
              >
                <action.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="font-medium text-sm sm:text-base">{action.label}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  {action.description}
                </p>
              </div>
              {action.badge !== undefined && (typeof action.badge === 'string' || action.badge > 0) && (
                <Badge
                  className={cn(
                    'text-[10px] sm:text-xs ml-1.5 sm:ml-2 shrink-0 px-1.5 sm:px-2',
                    badgeVariantStyles[action.badgeVariant || 'default']
                  )}
                >
                  {action.badge}
                </Badge>
              )}
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
