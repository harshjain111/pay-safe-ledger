import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Wallet, Eye, EyeOff, Loader2, Phone, Mail, ArrowLeft, WifiOff, RefreshCw, KeyRound, PartyPopper } from 'lucide-react';
import { toast } from '@/lib/toast';
import { phoneToEmail, PHONE_EMAIL_DOMAIN } from '@/lib/auth-email';
import { supabase } from '@/integrations/supabase/client';
import { ORGANIZATION, BRAND } from '@/lib/brand';
import { z } from 'zod';

const phoneSchema = z.string().min(10, 'Please enter a valid phone number').max(15, 'Phone number too long');
const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

const looksLikeEmail = (v: string) => v.includes('@');

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SIGN_IN_TIMEOUT_MS = 12000;
const SIGN_IN_SPINNER_FAILSAFE_MS = 20000;

const isLikelyNetworkError = (message = '') => {
  const normalized = message.toLowerCase();
  return [
    'failed to fetch',
    'networkerror',
    'load failed',
    'fetch',
    'timed out',
    'timeout',
    'network request failed',
  ].some(pattern => normalized.includes(pattern));
};

const runSignInWithTimeout = async (
  signInFn: () => Promise<{ error: Error | null }>,
  timeoutMs: number
): Promise<{ error: Error | null }> => {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<{ error: Error }>((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve({ error: new Error('Sign-in request timed out') });
    }, timeoutMs);
  });

  const result = await Promise.race([signInFn(), timeoutPromise]);

  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  return result;
};

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('rememberMe') === 'true';
  });

  // Sign-in steps: 'identifier' → then either 'password' (returning user) or
  // 'set-password' (first-time user creating their password).
  const [step, setStep] = useState<'identifier' | 'password' | 'set-password'>('identifier');
  const [identifier, setIdentifier] = useState(() => {
    return rememberMe ? localStorage.getItem('savedIdentifier') || localStorage.getItem('savedPhone') || '' : '';
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checking, setChecking] = useState(false);
  // Suppresses the auto-redirect effect while we silently sign a first-time
  // user in (with their bootstrap code) to set their new password.
  const manualNavRef = useRef(false);

  // Identifier can be an employee code (e.g. K2H137), a phone number, or an email.
  const identifierRaw = identifier.trim();
  const identifierIsEmail = looksLikeEmail(identifierRaw);
  const identifierDigits = identifierRaw.replace(/\D/g, '');
  const identifierIsPhone = !identifierIsEmail && /^[\d\s+\-()]+$/.test(identifierRaw) && identifierDigits.length >= 10;
  const cleanIdentifier = identifierIsEmail ? identifierRaw.toLowerCase() : (identifierIsPhone ? identifierDigits : identifierRaw);

  useEffect(() => {
    if (user && !authLoading && !manualNavRef.current) {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  // NOTE: do not wipe sb-*-auth-token keys here. That used to log valid
  // users out the moment they touched /auth (e.g. via back button), and
  // amplified the "logged out after a minute" bug on slow networks.


  const formatPhoneInput = (value: string) => value.replace(/\D/g, '');

  useEffect(() => {
    if (!isLoading) return;

    const spinnerFailsafe = window.setTimeout(() => {
      setIsLoading(false);
      setNetworkError(true);
      toast.error('Sign-in is taking too long. Please check your network and try again.');
    }, SIGN_IN_SPINNER_FAILSAFE_MS);

    return () => window.clearTimeout(spinnerFailsafe);
  }, [isLoading]);

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        signal: controller.signal,
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      clearTimeout(timeout);
      if (res.ok) {
        setNetworkError(false);
        toast.success('Connection restored! Try signing in again.');
      } else {
        toast.error('Backend responded but with an error. Please try again later.');
      }
    } catch {
      toast.error('Still unable to reach the server. Check your internet, VPN, or try a different network.');
    } finally {
      setIsCheckingConnection(false);
    }
  };

  // Resolve an employee code / phone / email to the account's login email.
  const resolveLoginEmail = async (): Promise<string> => {
    try {
      const { data } = await supabase.rpc('resolve_login_email' as never, { _id: identifierRaw } as never);
      if (data) return String(data);
    } catch { /* fall through to heuristics */ }
    if (identifierIsEmail) return cleanIdentifier;
    if (identifierIsPhone) return phoneToEmail(identifierDigits);
    return `${identifierRaw.toLowerCase()}@${PHONE_EMAIL_DOMAIN}`; // employee code
  };

  // Step 1 → Step 2: validate the identifier, then decide whether this is a
  // first-time user (→ set-password) or a returning user (→ password).
  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (identifierIsEmail) emailSchema.parse(cleanIdentifier);
      else if (identifierIsPhone) phoneSchema.parse(identifierDigits);
      else if (identifierRaw.length < 3) throw new z.ZodError([{ code: 'custom', message: 'Enter your employee code, phone, or email', path: [] }]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    // Ask the backend whether this account still needs to create a password.
    setChecking(true);
    let firstTime = false;
    try {
      const { data } = await supabase.rpc('is_first_time_login' as never, { _id: identifierRaw } as never);
      firstTime = data === true;
    } catch { /* fall back to the normal password step */ }
    setChecking(false);
    setStep(firstTime ? 'set-password' : 'password');
  };

  // First-time users: silently sign in with the bootstrap credential (their
  // employee code) and immediately set the password they chose here.
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNetworkError(false);

    try {
      passwordSchema.parse(newPassword);
    } catch (error) {
      if (error instanceof z.ZodError) { toast.error(error.errors[0].message); return; }
    }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNetworkError(true);
      toast.error('You appear to be offline. Please check your internet and try again.');
      return;
    }

    setIsLoading(true);
    manualNavRef.current = true; // hold off the auto-redirect until we're done
    try {
      const email = await resolveLoginEmail();
      // Bootstrap password = the employee code (local-part of the login email).
      const bootstrap = (email.split('@')[0] || identifierRaw).toLowerCase();

      const { error: signErr } = await runSignInWithTimeout(() => signIn(email, bootstrap), SIGN_IN_TIMEOUT_MS);
      if (signErr) {
        // Bootstrap didn't work (e.g. password already changed) — fall back to
        // asking for their current password rather than blocking them.
        manualNavRef.current = false;
        setIsLoading(false);
        toast.error('Please enter your current password to continue.');
        setStep('password');
        return;
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;

      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('savedIdentifier', cleanIdentifier);
      }
      // Tell onboarding the password is already done so it skips that step.
      localStorage.setItem('hrbuddy_pw_set', '1');
      toast.success('Password set! Let’s finish your profile.');
      setIsLoading(false);
      navigate('/onboarding');
    } catch (err) {
      manualNavRef.current = false;
      setIsLoading(false);
      setNetworkError(isLikelyNetworkError(err instanceof Error ? err.message : ''));
      toast.error(err instanceof Error ? err.message : 'Could not set your password. Please try again.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNetworkError(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNetworkError(true);
      toast.error('You appear to be offline. Please check your internet and try again.');
      return;
    }

    try {
      if (identifierIsEmail) emailSchema.parse(cleanIdentifier);
      else if (identifierIsPhone) phoneSchema.parse(identifierDigits);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    setIsLoading(true);
    const pseudoEmail = await resolveLoginEmail();
    let isAuthenticated = false;

    try {
      // Attempt with one retry for transient network drops
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await runSignInWithTimeout(
          () => signIn(pseudoEmail, loginPassword),
          SIGN_IN_TIMEOUT_MS
        );

        if (!error) {
          // Success
          if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
            localStorage.setItem('savedIdentifier', cleanIdentifier);
          } else {
            localStorage.removeItem('rememberMe');
            localStorage.removeItem('savedIdentifier');
            localStorage.removeItem('savedPhone');
          }
          isAuthenticated = true;
          toast.success('Welcome back!');
          setIsLoading(false);
          navigate('/dashboard');
          return;
        }

        lastError = error;

        // Only retry on network errors, not auth errors
        const isNetworkErr = isLikelyNetworkError(error.message);
        if (!isNetworkErr || attempt === 1) break;

        // Brief backoff before retry
        await new Promise(r => setTimeout(r, 1500));
      }

      if (lastError) {
        const msg = lastError.message || '';
        const isNetworkErr = isLikelyNetworkError(msg);

        if (isNetworkErr) {
          setNetworkError(true);
          toast.error('Network error — unable to reach the server.');
        } else if (msg.includes('Invalid login credentials')) {
          toast.error('Invalid phone number or password');
        } else {
          toast.error(msg);
        }
      }
    } catch {
      setNetworkError(true);
      toast.error('Sign-in request was interrupted. Please try again.');
    } finally {
      if (!isAuthenticated) {
        setIsLoading(false);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center justify-center gap-3 mb-4">
            <div className="rounded-2xl bg-white p-3 shadow-lg">
              <img src={ORGANIZATION.logo ?? BRAND.logoPath} alt={ORGANIZATION.name} className="h-20 w-auto" />
            </div>
            <span className="text-2xl font-bold text-foreground tracking-tight">VIBRND HR BUDDY</span>
          </div>
          <p className="text-muted-foreground">HR & Payroll Suite</p>
          {ORGANIZATION.name && (
            <p className="mt-2 text-xs text-muted-foreground">
              for <span className="font-medium text-foreground">{ORGANIZATION.name}</span>
            </p>
          )}
        </div>

        {/* Network error banner */}
        {networkError && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <WifiOff className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">Unable to reach the server</p>
                <p className="text-destructive/80">
                  This is usually caused by network issues, VPN, ad-blockers, or firewall rules. Try:
                </p>
                <ul className="list-disc pl-4 text-destructive/80 space-y-1">
                  <li>Switching to a different network (e.g. mobile hotspot)</li>
                  <li>Disabling VPN or ad-blockers</li>
                  <li>Clearing site data and refreshing</li>
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkConnection}
                  disabled={isCheckingConnection}
                  className="mt-2"
                >
                  {isCheckingConnection ? (
                    <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Checking...</>
                  ) : (
                    <><RefreshCw className="mr-2 h-3 w-3" />Check Connection</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card className="shadow-xl border-border/50">
          <CardHeader className="pb-4 text-center">
            <h2 className="text-xl font-semibold">{step === 'set-password' ? 'Welcome! 🎉' : 'Welcome Back'}</h2>
            <p className="text-sm text-muted-foreground">
              {step === 'identifier'
                ? 'Sign in with your employee code, phone, or email'
                : step === 'set-password'
                  ? 'Create a password to secure your account'
                  : 'Enter your password to continue'}
            </p>
          </CardHeader>

          <CardContent>
            {step === 'identifier' ? (
              <form onSubmit={handleContinue} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-id">Employee code, phone, or email</Label>
                  <div className="relative">
                    {identifierIsEmail
                      ? <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      : <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
                    <Input
                      id="login-id"
                      type="text"
                      inputMode="email"
                      placeholder="e.g. K2H001, phone, or email"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      required
                      autoFocus
                      autoComplete="username"
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">First time? Just enter your employee code — we'll help you set your password next.</p>
                </div>

                <Button type="submit" className="w-full" disabled={checking}>
                  {checking ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>) : 'Continue'}
                </Button>

                <p className="text-xs text-center text-muted-foreground pt-2">
                  Contact your administrator if you don't have an account
                </p>
              </form>
            ) : step === 'set-password' ? (
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                {/* Chosen identifier + change */}
                <button
                  type="button"
                  onClick={() => { setStep('identifier'); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5 font-medium">
                    {identifierIsEmail ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                    {cleanIdentifier}
                  </span>
                  <span className="ml-auto text-xs text-primary">Change</span>
                </button>

                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs text-muted-foreground">
                    Looks like it's your first time. Create a password you'll use to sign in from now on.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="new-password"
                      className="pl-10"
                    />
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="pl-10"
                    />
                  </div>
                  {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading || newPassword.length < 6 || newPassword !== confirmPassword}>
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Setting up…</>) : 'Set password & continue'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Chosen identifier + change */}
                <button
                  type="button"
                  onClick={() => { setStep('identifier'); setLoginPassword(''); }}
                  className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5 font-medium">
                    {identifierIsEmail ? <Mail className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                    {cleanIdentifier}
                  </span>
                  <span className="ml-auto text-xs text-primary">Change</span>
                </button>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={checked => setRememberMe(checked === true)}
                  />
                  <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer select-none">
                    Remember me
                  </Label>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">© 2026 Vibrnd. VIBRND HR BUDDY. All rights reserved.</p>
      </div>
    </div>
  );
}
