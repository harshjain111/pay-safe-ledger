import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import {
  Key,
  Globe,
  Shield,
  LogOut,
  Smartphone,
  Fingerprint,
  Monitor,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  User,
  Calculator,
  Building2,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ClearTransactionDataCard } from '@/components/settings/ClearTransactionDataCard';
import { ManageCategoriesCard } from '@/components/settings/ManageCategoriesCard';
import { AttendanceCoverageCard } from '@/components/settings/AttendanceCoverageCard';
import { StatutorySettingsCard } from '@/components/settings/StatutorySettingsCard';
import { LeaveTypesCard } from '@/components/settings/LeaveTypesCard';
import { HrPayRulesCard } from '@/components/settings/HrPayRulesCard';
import { HolidaysCard } from '@/components/settings/HolidaysCard';
import { ManageOutletsDepartmentsCard } from '@/components/settings/ManageOutletsDepartmentsCard';
import { BiometricDevicesCard } from '@/components/settings/BiometricDevicesCard';

type CategoryId = 'account' | 'payroll' | 'attendance' | 'hardware' | 'organisation' | 'data';

interface Category {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this category; undefined = everyone. */
  permission?: string;
}

const CATEGORIES: Category[] = [
  { id: 'account', label: 'My Account', icon: User },
  { id: 'payroll', label: 'Payroll & Statutory', icon: Calculator, permission: 'settings.payroll.edit' },
  { id: 'attendance', label: 'Attendance & Leave', icon: Clock, permission: 'settings.attendance.edit' },
  { id: 'hardware', label: 'Hardware', icon: Fingerprint, permission: 'settings.attendance.edit' },
  { id: 'organisation', label: 'Organisation', icon: Building2, permission: 'settings.organisation.edit' },
  { id: 'data', label: 'Data Management', icon: Database, permission: 'settings.data.manage' },
];

export default function Settings() {
  const { category } = useParams<{ category?: string }>();
  const navigate = useNavigate();
  const { user, userRole, staffData, can } = useAuth();
  const { language, setLanguage } = useLanguage();

  const visible = CATEGORIES.filter((c) => !c.permission || can(c.permission));
  const active = visible.find((c) => c.id === category) ?? visible[0];

  // Normalize the URL: unknown / disallowed category → first visible one.
  useEffect(() => {
    if (!category || !visible.some((c) => c.id === category)) {
      navigate(`/settings/${visible[0].id}`, { replace: true });
    }
  }, [category, visible, navigate]);

  // --- My Account state (password change) ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const browserInfo = navigator.userAgent.split(' ').slice(-1)[0].split('/')[0] || 'Browser';

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('New password must be different from current password');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (signInError) {
        toast.error('Current password is incorrect');
        setIsChangingPassword(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setPasswordChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
      setTimeout(() => setPasswordChangeSuccess(false), 3000);
    } catch (error: unknown) {
      console.error('Password change error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast.success('Signed out from all devices');
    } catch {
      toast.error('Failed to sign out from all devices');
    }
  };

  const getRoleLabel = (role: string | null) => (!role ? 'User' : role.charAt(0).toUpperCase() + role.slice(1));
  const lastSignIn = user?.last_sign_in_at
    ? format(new Date(user.last_sign_in_at), 'dd MMM yyyy, hh:mm a')
    : 'N/A';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Settings" description="Manage your account, organisation and data settings" />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left category rail */}
        <nav aria-label="Settings categories" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {visible.map((c) => {
            const Icon = c.icon;
            const isActive = active.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/settings/${c.id}`)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors lg:w-full',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{c.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right content panel */}
        <div className="min-w-0">
          {active.id === 'account' && (
            <SettingsPanel title="My Account" description="Your profile, language, password and security.">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Account Overview
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Your account information and status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Name</span>
                    <span className="font-medium text-sm sm:text-base truncate max-w-[180px]">{staffData?.full_name || user?.email?.split('@')[0] || 'User'}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Phone</span>
                    <span className="font-medium text-sm sm:text-base">{staffData?.phone || 'Not set'}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Role</span>
                    <Badge variant="secondary" className="text-xs">{getRoleLabel(userRole)}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      Last Login
                    </span>
                    <span className="text-xs sm:text-sm">{lastSignIn}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                      {isMobile ? <Smartphone className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Monitor className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                      Device
                    </span>
                    <span className="text-xs sm:text-sm">{deviceType} • {browserInfo}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Language
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Choose your preferred language</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm">Display Language</Label>
                    <Select value={language} onValueChange={(value: 'en' | 'hi' | 'as') => setLanguage(value)}>
                      <SelectTrigger className="h-10 sm:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">🇬🇧 English</SelectItem>
                        <SelectItem value="hi">🇮🇳 हिंदी (Hindi)</SelectItem>
                        <SelectItem value="as">🇮🇳 অসমীয়া (Assamese)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Language preference is saved automatically</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Key className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Change Password
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Update your account password for security</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                  {passwordChangeSuccess ? (
                    <div className="flex items-center gap-3 p-3 sm:p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                      <span className="text-green-600 dark:text-green-400 font-medium text-sm sm:text-base">Password changed successfully!</span>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {([
                        ['current-password', 'Current Password', currentPassword, setCurrentPassword, showCurrentPassword, setShowCurrentPassword],
                        ['new-password', 'New Password', newPassword, setNewPassword, showNewPassword, setShowNewPassword],
                        ['confirm-password', 'Confirm New Password', confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword],
                      ] as const).map(([id, label, value, setValue, show, setShow]) => (
                        <div key={id} className="space-y-2">
                          <Label htmlFor={id} className="text-xs sm:text-sm">{label}</Label>
                          <div className="relative">
                            <Input
                              id={id}
                              type={show ? 'text' : 'password'}
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                              placeholder="••••••••"
                              className="h-10 sm:h-11 pr-10 text-sm"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              aria-label={show ? 'Hide password' : 'Show password'}
                              onClick={() => setShow(!show)}
                            >
                              {show ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                          {id === 'new-password' && <p className="text-[10px] sm:text-xs text-muted-foreground">Minimum 6 characters</p>}
                        </div>
                      ))}
                      <div className="sm:col-span-3 flex justify-end pt-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" disabled={!currentPassword || !newPassword || !confirmPassword || isChangingPassword}>
                              {isChangingPassword ? (
                                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /><span className="text-sm">Changing...</span></>
                              ) : (
                                <span className="text-sm">Change Password</span>
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-base sm:text-lg">Confirm Password Change</AlertDialogTitle>
                              <AlertDialogDescription className="text-xs sm:text-sm">
                                Are you sure you want to change your password? You will need to use the new password for future logins.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handlePasswordChange} className="text-sm">Confirm Change</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Security
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Manage your account security</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Sign out of all devices</p>
                      <p className="text-xs text-muted-foreground">Ends your session on every device</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 justify-center shrink-0">
                          <LogOut className="h-4 w-4" />
                          <span className="text-sm">Sign out of all devices</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-base sm:text-lg">Sign Out Everywhere</AlertDialogTitle>
                          <AlertDialogDescription className="text-xs sm:text-sm">
                            This will sign you out from all devices and browsers. You will need to log in again on each device.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="text-sm">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleSignOutAllDevices} className="text-sm">Sign out of all devices</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            </SettingsPanel>
          )}

          {active.id === 'payroll' && (
            <SettingsPanel title="Payroll & Statutory" description="Statutory compliance: PF, ESI, PT and overtime.">
              <StatutorySettingsCard />
            </SettingsPanel>
          )}

          {active.id === 'attendance' && (
            <SettingsPanel title="Attendance & Leave" description="How attendance becomes paid days, leave entitlement and coverage.">
              <HrPayRulesCard />
              <LeaveTypesCard />
              <AttendanceCoverageCard />
              <HolidaysCard />
            </SettingsPanel>
          )}

          {active.id === 'hardware' && (
            <SettingsPanel title="Hardware Management" description="Biometric & face-recognition devices that punch attendance.">
              <BiometricDevicesCard />
            </SettingsPanel>
          )}

          {active.id === 'organisation' && (
            <SettingsPanel title="Organisation" description="Outlets, departments and expense categories.">
              <ManageOutletsDepartmentsCard />
              <ManageCategoriesCard />
            </SettingsPanel>
          )}

          {active.id === 'data' && (
            <SettingsPanel title="Data Management" description="Back up and clear transactional data.">
              <ClearTransactionDataCard />
            </SettingsPanel>
          )}
        </div>
      </div>
    </div>
  );
}
