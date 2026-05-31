import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Wallet, Eye, EyeOff, Loader2, Phone, WifiOff, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { phoneToEmail } from '@/lib/auth-email';
import { z } from 'zod';

const phoneSchema = z.string().min(10, 'Please enter a valid phone number').max(15, 'Phone number too long');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

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

  const [loginPhone, setLoginPhone] = useState(() => {
    return rememberMe ? localStorage.getItem('savedPhone') || '' : '';
  });
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    if (user && !authLoading) {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNetworkError(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNetworkError(true);
      toast.error('You appear to be offline. Please check your internet and try again.');
      return;
    }

    const cleanPhone = formatPhoneInput(loginPhone);

    try {
      phoneSchema.parse(cleanPhone);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    setIsLoading(true);
    const pseudoEmail = phoneToEmail(cleanPhone);
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
            localStorage.setItem('savedPhone', cleanPhone);
          } else {
            localStorage.removeItem('rememberMe');
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
            <img src="/vibrnd-logo.png" alt="VIBRND HR BUDDY" className="h-20 w-auto" />
            <span className="text-2xl font-bold text-foreground tracking-tight">VIBRND HR BUDDY</span>
          </div>
          <p className="text-muted-foreground">HR & Payroll Suite</p>
          <p className="mt-2 text-xs text-muted-foreground">
            for <span className="font-medium text-foreground">Konnect 2 Hospitality</span>
          </p>
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
            <h2 className="text-xl font-semibold">Welcome Back</h2>
            <p className="text-sm text-muted-foreground">Sign in with your phone number</p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-phone"
                    type="tel"
                    placeholder="9876543210"
                    value={loginPhone}
                    onChange={e => setLoginPhone(formatPhoneInput(e.target.value))}
                    required
                    autoComplete="tel"
                    className="pl-10"
                    maxLength={15}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Enter your registered phone number</p>
              </div>

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
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
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

              <p className="text-xs text-center text-muted-foreground pt-2">
                Contact your administrator if you don't have an account
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">© 2026 Vibrnd. VIBRND HR BUDDY. All rights reserved.</p>
      </div>
    </div>
  );
}
