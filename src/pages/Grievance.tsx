import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck, Trash2, ImagePlus, Loader2, CheckCircle2, Send,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GRIEVANCE_CATEGORIES, submitGrievance } from '@/lib/grievance';

const MAX_ATTACH = 8 * 1024 * 1024; // 8 MB

export default function Grievance() {
  const [category, setCategory] = useState<string>(GRIEVANCE_CATEGORIES[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Concerns are attributed by default so management can follow up; the employee
  // may opt into anonymity with the checkbox below.
  const [anonymous, setAnonymous] = useState(false);

  // photo
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast({ title: 'Please choose an image', variant: 'destructive' });
    if (f.size > MAX_ATTACH) return toast({ title: 'Image too large', description: 'Max 8 MB.', variant: 'destructive' });
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const onSubmit = async () => {
    if (!message.trim() && !photo) {
      return toast({ title: 'Nothing to send', description: 'Add a note or a photo.', variant: 'destructive' });
    }
    setSubmitting(true);
    try {
      await submitGrievance({ category, message: message.trim(), photo, anonymous });
      setDone(true);
    } catch (e) {
      toast({ title: 'Could not submit', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-lg p-4 sm:p-6">
        <Card className="text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <h2 className="text-xl font-semibold">{anonymous ? 'Submitted anonymously' : 'Concern submitted'}</h2>
            <p className="text-sm text-muted-foreground">
              {anonymous ? (
                <>Thank you. Your concern has been recorded with <strong>no link to your identity</strong>. The management team will review it.</>
              ) : (
                <>Thank you. Your concern has been submitted <strong>with your name</strong> so management can follow up with you.</>
              )}
            </p>
            <Button variant="outline" onClick={() => { setDone(false); setMessage(''); setPhoto(null); setPhotoPreview(null); }}>
              Raise another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Raise a concern
          </CardTitle>
          <CardDescription>
            Report a problem or something you witnessed. You can type or attach a photo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Anonymous toggle — prominent by design, opt-in */}
          <label
            htmlFor="grievance-anon"
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors',
              anonymous ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-500/50 bg-amber-500/10',
            )}
          >
            <Checkbox
              id="grievance-anon"
              checked={anonymous}
              onCheckedChange={(v) => setAnonymous(v === true)}
              className="mt-0.5 h-6 w-6"
            />
            <div className="space-y-0.5">
              <span className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className={cn('h-5 w-5', anonymous ? 'text-emerald-600' : 'text-amber-600')} />
                Submit anonymously
              </span>
              <p className="text-sm text-muted-foreground">
                {anonymous
                  ? 'Your identity is NOT recorded — no name, no account. Uncheck if you want management to know it’s you.'
                  : 'Your name WILL be shared with management for this concern so they can follow up with you. Check the box to stay anonymous.'}
              </p>
            </div>
          </label>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRIEVANCE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>What happened?</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Describe the issue or what you saw…"
            />
          </div>

          {/* Photo */}
          <div className="space-y-1.5">
            <Label>Photo (optional)</Label>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
            {!photoPreview ? (
              <Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()} className="w-full gap-2">
                <ImagePlus className="h-4 w-4" /> Attach a photo
              </Button>
            ) : (
              <div className="relative">
                <img src={photoPreview} alt="Attached" className="max-h-56 w-full rounded-lg border object-contain bg-muted/40" />
                <Button type="button" variant="secondary" size="icon" className="absolute top-2 right-2"
                  aria-label="Remove photo" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Button onClick={onSubmit} disabled={submitting} className="w-full gap-2">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> {anonymous ? 'Submit anonymously' : 'Submit concern'}</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
