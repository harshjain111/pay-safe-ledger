import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 as SpinnerIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { LANGUAGES, toAppLanguage } from '@/lib/languages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from '@/hooks/use-toast';
import { ORGANIZATION, BRAND } from '@/lib/brand';
import {
  PartyPopper, Languages, IdCard, Eye, EyeOff, Loader2, Check, ChevronDown, ArrowRight, ArrowLeft, Sparkles,
} from 'lucide-react';

const STEPS = ['Welcome', 'Language', 'Your details'] as const;

export default function Onboarding() {
  const { user, staffData, isLoading } = useAuth();
  const { setLanguage } = useLanguage();
  const { data: org } = useOrganizationProfile();
  const orgName = org?.trade_name || org?.legal_name || ORGANIZATION.name || 'your organization';

  const [step, setStep] = useState(0);
  const [langCode, setLangCode] = useState('en');
  const [langOpen, setLangOpen] = useState(false);
  const [email, setEmail] = useState(staffData?.email && staffData.email !== '' ? staffData.email : '');
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedLang = useMemo(() => LANGUAGES.find((l) => l.code === langCode), [langCode]);
  const firstName = (staffData?.full_name || '').trim().split(/\s+/)[0] || 'there';

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    if (password || confirm) {
      if (password.length < 6) return toast({ title: 'Password too short', description: 'Use at least 6 characters.', variant: 'destructive' });
      if (password !== confirm) return toast({ title: 'Passwords do not match', variant: 'destructive' });
    }
    const cleanAadhaar = aadhaar.replace(/\D/g, '');
    if (cleanAadhaar && cleanAadhaar.length !== 12) return toast({ title: 'Invalid Aadhaar', description: 'Aadhaar must be 12 digits.', variant: 'destructive' });

    setSaving(true);
    try {
      if (password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password });
        if (pwErr) throw pwErr;
      }
      const { error } = await supabase.rpc('complete_staff_onboarding' as never, {
        _email: email.trim(),
        _pan: pan.trim().toUpperCase(),
        _aadhaar: cleanAadhaar,
        _lang: langCode,
      } as never);
      if (error) throw error;

      setLanguage(toAppLanguage(langCode));
      // Kick off the guided tour on the dashboard after a full reload (so the
      // refreshed staffData carries onboarding_completed = true).
      localStorage.setItem('hrbuddy_run_tour', '1');
      toast({ title: `Welcome aboard, ${firstName}! 🎉` });
      window.location.href = '/dashboard';
    } catch (e) {
      toast({ title: 'Could not finish setup', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><SpinnerIcon className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="rounded-2xl bg-white p-2.5 shadow-lg">
            <img src={ORGANIZATION.logo ?? BRAND.logoPath} alt="VIBRND HR BUDDY" className="h-14 w-auto" />
          </div>
          <span className="text-lg font-bold tracking-tight">VIBRND HR BUDDY</span>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
          {/* Progress */}
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>{STEPS[step]}</span>
              <span>Step {step + 1} of {STEPS.length}</span>
            </div>
            <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
          </div>

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold">Welcome, {firstName}!</h1>
                <p className="text-muted-foreground">
                  You've joined <span className="font-semibold text-foreground">{orgName}</span> on VIBRND HR BUDDY —
                  your home for attendance, leave, advances and payslips. Let's set up your account in a minute.
                </p>
              </div>
              <Button onClick={next} className="w-full gap-2">
                <Sparkles className="h-4 w-4" /> Get started
              </Button>
            </div>
          )}

          {/* Step 1: Language */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <Languages className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Choose your language</h2>
                  <p className="text-sm text-muted-foreground">You can change this later in Settings.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preferred language</Label>
                <Popover open={langOpen} onOpenChange={setLangOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selectedLang ? (
                        <span>{selectedLang.native} <span className="text-muted-foreground">· {selectedLang.label}</span></span>
                      ) : 'Select language'}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command
                      filter={(value, search) => {
                        const l = LANGUAGES.find((x) => x.code === value);
                        const hay = `${l?.label} ${l?.native} ${l?.code}`.toLowerCase();
                        return hay.includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Search language…" />
                      <CommandList>
                        <CommandEmpty>No language found.</CommandEmpty>
                        <CommandGroup>
                          {LANGUAGES.map((l) => (
                            <CommandItem key={l.code} value={l.code} onSelect={(v) => { setLangCode(v); setLangOpen(false); }}>
                              <Check className={langCode === l.code ? 'mr-2 h-4 w-4 opacity-100' : 'mr-2 h-4 w-4 opacity-0'} />
                              <span className="flex-1">{l.native} <span className="text-muted-foreground">· {l.label}</span></span>
                              {!l.supported && <span className="text-[10px] text-muted-foreground">soon</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedLang && !selectedLang.supported && (
                  <p className="text-xs text-muted-foreground">The app currently shows English for {selectedLang.label}; we've saved your preference.</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={next} className="flex-1 gap-2">Continue <ArrowRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {/* Step 2: Details + password */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <IdCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Your details</h2>
                  <p className="text-sm text-muted-foreground">Fill what you can — you can update it later.</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-email">Email</Label>
                  <Input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-pan">PAN number</Label>
                    <Input id="ob-pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-aadhaar">Aadhaar number</Label>
                    <Input id="ob-aadhaar" inputMode="numeric" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="12 digits" maxLength={14} />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-sm font-medium">Set your password</p>
                  <div className="relative">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New password (min 6 chars)"
                      autoComplete="new-password"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={back} disabled={saving} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={finish} disabled={saving} className="flex-1 gap-2">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Finishing…</> : <>Finish setup <Check className="h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
