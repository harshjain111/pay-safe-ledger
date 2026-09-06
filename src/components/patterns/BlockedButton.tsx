import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// A button that says why it cannot be pressed.
//
// A greyed-out control with no explanation is a dead end: the user can see the
// thing they want and has no idea what to do about it. Pass the reason and it
// becomes a tooltip; pass null and this is an ordinary Button.
//
// Deliberately NOT the `disabled` attribute. A disabled button is removed from
// the tab order and fires no pointer events, so a tooltip on it is unreachable
// by keyboard AND never opens on hover — the explanation would exist for nobody.
// aria-disabled keeps the control focusable and announced as unavailable, which
// is what assistive tech expects, and the click is refused in the handler.
//
// It still LOOKS disabled: the same muted styling, and a not-allowed cursor.
// ---------------------------------------------------------------------------

interface BlockedButtonProps extends Omit<ComponentProps<typeof Button>, 'disabled'> {
  /** Why the action is unavailable. Null / undefined = the button works. */
  blockedReason?: string | null;
  children: ReactNode;
}

export function BlockedButton({
  blockedReason,
  children,
  className,
  onClick,
  ...rest
}: BlockedButtonProps) {
  if (!blockedReason) {
    return (
      <Button className={className} onClick={onClick} {...rest}>
        {children}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...rest}
          aria-disabled="true"
          // Focusable and hoverable so the reason is actually reachable; the
          // action itself is refused here rather than by the browser.
          onClick={(e) => { e.preventDefault(); }}
          // Variant-agnostic: opacity and cursor only, so an outline or icon
          // button is not repainted with the primary colour.
          className={cn('cursor-not-allowed opacity-50', className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {blockedReason}
      </TooltipContent>
    </Tooltip>
  );
}
