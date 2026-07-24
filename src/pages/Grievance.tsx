import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck, Mic, Square, Trash2, ImagePlus, Loader2, CheckCircle2, Send,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { GRIEVANCE_CATEGORIES, submitGrievance } from '@/lib/grievance';

const MAX_ATTACH = 8 * 1024 * 1024; // 8 MB

export default function Grievance() {
  const [category, setCategory] = useState<string>(GRIEVANCE_CATEGORIES[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // photo
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // voice
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast({ title: 'Please choose an image', variant: 'destructive' });
    if (f.size > MAX_ATTACH) return toast({ title: 'Image too large', description: 'Max 8 MB.', variant: 'destructive' });
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setVoice(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      toast({ title: 'Microphone blocked', description: 'Allow mic access to record a voice note.', variant: 'destructive' });
    }
  };
  const stopRec = () => { recorderRef.current?.stop(); setRecording(false); };
  const clearVoice = () => { setVoice(null); setVoiceUrl(null); };

  const onSubmit = async () => {
    if (!message.trim() && !photo && !voice) {
      return toast({ title: 'Nothing to send', description: 'Add a note, a photo, or a voice message.', variant: 'destructive' });
    }
    setSubmitting(true);
    try {
      await submitGrievance({ category, message: message.trim(), photo, voice });
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
            <h2 className="text-xl font-semibold">Submitted anonymously</h2>
            <p className="text-sm text-muted-foreground">
              Thank you. Your concern has been recorded with <strong>no link to your identity</strong>.
              The management team will review it.
            </p>
            <Button variant="outline" onClick={() => { setDone(false); setMessage(''); setPhoto(null); setPhotoPreview(null); clearVoice(); }}>
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
            Report a problem or something you witnessed. You can type, attach a photo, or record a voice note.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Anonymity assurance */}
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">This is fully anonymous.</span> We do not record who you
              are — no name, no account, nothing. Even the exact time isn't stored.
            </p>
          </div>

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

          {/* Voice note */}
          <div className="space-y-1.5">
            <Label>Voice note (optional)</Label>
            {!voice ? (
              <Button type="button" variant={recording ? 'destructive' : 'outline'} onClick={recording ? stopRec : startRec} className="w-full gap-2">
                {recording ? <><Square className="h-4 w-4" /> Stop recording…</> : <><Mic className="h-4 w-4" /> Record voice note</>}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <audio controls src={voiceUrl ?? undefined} className="h-9 flex-1" />
                <Button type="button" variant="ghost" size="icon" aria-label="Delete voice note" onClick={clearVoice}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
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
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit anonymously</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
