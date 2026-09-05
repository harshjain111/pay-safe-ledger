import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// The phone number, edited where the employee already is.
//
// Staff sign in with their phone, and most records predate that and have none.
// Rather than a separate screen for filling them in — which would be dead
// weight in the nav the moment the backlog is cleared — the number is editable
// in the Employees row itself.
//
// The number must be unique (staff_phone_digits_unique) because
// resolve_login_email() finds an account by phone; a clash comes back from the
// database and is shown against this row rather than as a generic failure.
// ---------------------------------------------------------------------------

const digitsOf = (v: string) => v.replace(/\D/g, '');

export function PhoneCell({
  staffId,
  value,
  canEdit,
  onSaved,
}: {
  staffId: string;
  value: string | null;
  canEdit: boolean;
  onSaved: (phone: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
    lastSaved.current = value ?? '';
    setError(null);
  }, [value]);

  if (!canEdit) {
    return value
      ? <span className="text-sm">{value}</span>
      : <span className="text-warning text-xs font-medium">Not set</span>;
  }

  const commit = async () => {
    const digits = digitsOf(draft);
    if (digits === digitsOf(lastSaved.current)) { setError(null); return; }
    if (digits.length === 0) { setError(null); setDraft(lastSaved.current); return; }
    if (digits.length < 10) { setError('Needs 10 digits'); return; }

    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('staff').update({ phone: digits }).eq('id', staffId);
      if (err) {
        setError(
          err.message.includes('staff_phone_digits_unique')
            ? 'Already used by another employee'
            : err.message,
        );
        return;
      }
      lastSaved.current = digits;
      setDraft(digits);
      onSaved(digits);
      toast.success('Phone number saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="relative w-[150px]">
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setDraft(lastSaved.current); setError(null); }
          }}
          disabled={saving}
          inputMode="numeric"
          placeholder="Add number"
          aria-label="Phone number"
          className={`h-8 pr-7 text-sm ${error ? 'border-destructive' : ''}`}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {saving
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : digitsOf(draft).length >= 10 && digitsOf(draft) === digitsOf(lastSaved.current)
              ? <Check className="h-3.5 w-3.5 text-muted-foreground" />
              : <Phone className="h-3.5 w-3.5 text-muted-foreground/50" />}
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
