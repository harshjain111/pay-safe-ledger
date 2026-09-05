import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import { parsePhoneImport, type StaffLite } from '@/lib/phone-import';

// ---------------------------------------------------------------------------
// Bulk phone import — paste two columns from a spreadsheet.
//
// Deliberately paste rather than a file upload: the numbers are being collected
// in a spreadsheet, and copying two columns out of Excel is fewer steps than
// exporting a CSV, finding it, and uploading it. Tabs, commas and spaces all
// separate, so a paste from Excel, Sheets or a text list all work.
//
// Everything is matched and checked BEFORE anything is written, so the preview
// is what will happen: which employee code hit which row, what will change,
// and what will be skipped and why.
// ---------------------------------------------------------------------------

export function ImportPhonesDialog({
  open, onOpenChange, staff, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffLite[];
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parsePhoneImport(text, staff) : []), [text, staff]);
  const ready = parsed.filter((p) => p.staff && !p.problem && !p.unchanged);
  const problems = parsed.filter((p) => p.problem);
  const unchanged = parsed.filter((p) => p.unchanged);

  const run = async () => {
    if (!ready.length) return;
    setSaving(true);
    try {
      // Row by row: one rejected number should not discard the rest.
      const failed: string[] = [];
      for (const p of ready) {
        const { error } = await supabase.from('staff').update({ phone: p.digits }).eq('id', p.staff!.id);
        if (error) failed.push(p.code);
      }
      const saved = ready.length - failed.length;
      if (saved) toast.success(`${saved} phone number${saved === 1 ? '' : 's'} imported`);
      if (failed.length) toast.error(`Could not save: ${failed.join(', ')}`);
      if (saved) { setText(''); onImported(); onOpenChange(false); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import phone numbers</DialogTitle>
          <DialogDescription>
            Paste two columns from your spreadsheet — employee code, then number. Nothing is saved
            until you press Import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Paste here</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={'K2H001\t9876543210\nK2H002\t9876543211'}
              className="font-mono text-xs"
            />
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{ready.length} to import</Badge>
                {unchanged.length > 0 && <Badge variant="outline">{unchanged.length} unchanged</Badge>}
                {problems.length > 0 && <Badge variant="destructive">{problems.length} skipped</Badge>}
              </div>

              {problems.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-destructive">
                  {problems.slice(0, 20).map((p, i) => (
                    <li key={i}>
                      <span className="font-mono">{p.code}</span> — {p.problem}
                    </li>
                  ))}
                  {problems.length > 20 && <li>…and {problems.length - 20} more</li>}
                </ul>
              )}

              {ready.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {ready.slice(0, 20).map((p, i) => (
                    <li key={i}>
                      <span className="font-mono">{p.code}</span> {p.staff?.full_name} → {p.digits}
                    </li>
                  ))}
                  {ready.length > 20 && <li>…and {ready.length - 20} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={run} disabled={saving || ready.length === 0} className="gap-2">
            <Upload className="h-4 w-4" />
            {saving ? 'Importing…' : ready.length ? `Import ${ready.length}` : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
