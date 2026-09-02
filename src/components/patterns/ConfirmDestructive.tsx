import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Pattern 11 — Attendo's delete pattern: names the specific record, states the
 * action is irreversible, requires typing a confirmation string, and uses the
 * buttons "Go Back" and "Proceed".
 */
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  recordName,
  description,
  confirmText,
  onConfirm,
  loading = false,
  proceedLabel = 'Proceed',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The specific record being acted on, shown verbatim. */
  recordName: string;
  description?: string;
  /** The string the user must type to enable Proceed (defaults to recordName). */
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  proceedLabel?: string;
}) {
  const required = confirmText ?? recordName;
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> {title}
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-1">
            <span className="block">
              This acts on <span className="font-semibold text-foreground">{recordName}</span> and{' '}
              <span className="font-semibold text-destructive">cannot be undone</span>.
            </span>
            {description && <span className="block">{description}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{required}</span> to confirm:
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Go Back</Button>
          <Button
            variant="destructive"
            disabled={loading || typed !== required}
            onClick={() => onConfirm()}
          >
            {loading ? 'Working…' : proceedLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
