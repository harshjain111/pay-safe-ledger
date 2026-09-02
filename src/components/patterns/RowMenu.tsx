import type { ComponentType } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Pattern 7 — the kebab row menu. 2–5 items, destructive items separated and
 * tinted. Replaces every inline row button in the app.
 */
export function RowMenu({ items, ariaLabel = 'Row actions' }: { items: RowMenuItem[]; ariaLabel?: string }) {
  const normal = items.filter((i) => !i.destructive);
  const destructive = items.filter((i) => i.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={ariaLabel}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {normal.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.label} onClick={item.onSelect} disabled={item.disabled}>
              {Icon && <Icon className="mr-2 h-4 w-4" />} {item.label}
            </DropdownMenuItem>
          );
        })}
        {normal.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onSelect}
              disabled={item.disabled}
              className="text-destructive focus:text-destructive"
            >
              {Icon && <Icon className="mr-2 h-4 w-4" />} {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
