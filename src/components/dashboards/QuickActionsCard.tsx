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

// Icon tints drawn from the same tokens as the dashboard's headline tiles, so
// the actions and the figures above them read as one system rather than two.
const variantStyles = {
  primary: 'bg-[hsl(var(--tile-violet))] text-[hsl(var(--tile-violet-ink))]',
  secondary: 'bg-[hsl(var(--tile-blue))] text-[hsl(var(--tile-blue-ink))]',
  accent: 'bg-[hsl(var(--tile-green))] text-[hsl(var(--tile-green-ink))]',
  muted: 'bg-[hsl(var(--tile-amber))] text-[hsl(var(--tile-amber-ink))]',
};

const badgeVariantStyles = {
  default: 'bg-primary/20 text-primary',
  destructive: 'bg-destructive text-destructive-foreground',
  success: 'bg-success/20 text-success',
};

export function QuickActionsCard({
  actions,
  title = 'Quick Actions',
  description = 'Everything you need, faster',
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
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-4 sm:px-6">
        {actions.map((action) => (
          <Link key={action.href} to={action.href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Button
              variant="outline"
              tabIndex={-1}
              className="w-full justify-start h-auto py-2.5 rounded-xl border-border/60 hover:-translate-y-0.5 hover:shadow-card-hover transition"
            >
              <div
                className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center mr-2.5 shrink-0',
                  variantStyles[action.variant || 'primary']
                )}
              >
                <action.icon className="h-4 w-4" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="truncate text-[13px] font-medium">{action.label}</p>
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
