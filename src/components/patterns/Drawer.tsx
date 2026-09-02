import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIZES = { sm: 380, md: 560, lg: 640 } as const;
export type DrawerSize = keyof typeof SIZES;

// Module-level open-drawer stack so Escape only closes the TOPMOST drawer and
// stacked drawers layer their z-indexes correctly.
const drawerStack: string[] = [];

/**
 * Pattern 5 — the right-hand offcanvas drawer. Tinted header bar (title left,
 * close X right), primary action pinned to the bottom, dimmed backdrop.
 * Supports STACKING: a drawer opened from inside a drawer unwinds cleanly with
 * Escape and backdrop clicks, topmost first.
 *
 * From Phase 2 onward, detail views never navigate to a new route — the list
 * stays behind the drawer with its scroll position and filters intact.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  size = 'md',
  children,
  footer,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  size?: DrawerSize;
  children: ReactNode;
  /** Pinned to the bottom — put the ONE primary action here. */
  footer?: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  const depthRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    drawerStack.push(id);
    depthRef.current = drawerStack.length - 1;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerStack[drawerStack.length - 1] === id) {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const idx = drawerStack.indexOf(id);
      if (idx >= 0) drawerStack.splice(idx, 1);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-register only on open/close
  }, [open, id]);

  if (!open) return null;
  const depth = Math.max(0, drawerStack.indexOf(id));
  const z = 50 + depth * 2;
  const width = SIZES[size];

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: z }} role="dialog" aria-modal="true">
      {/* Backdrop — clicking it closes THIS drawer only. */}
      <div
        className="absolute inset-0 bg-black/40"
        data-testid="drawer-backdrop"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col border-l bg-background shadow-xl',
          'animate-in slide-in-from-right duration-200',
        )}
        style={{ maxWidth: width }}
      >
        {/* Tinted header bar */}
        <div className="flex items-start gap-3 border-b bg-secondary/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && <div className="border-t bg-card px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
