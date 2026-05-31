import { useState } from 'react';
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
  Settings as SettingsIcon, 
  Key, 
  Globe, 
  Shield, 
  LogOut, 
  Smartphone,
  Monitor,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ClearTransactionDataCard } from '@/components/settings/ClearTransactionDataCard';
import { ManageCategoriesCard } from '@/components/settings/ManageCategoriesCard';
import { ManageClubsCard } from '@/components/settings/ManageClubsCard';
import { DisciplineRulesCard } from '@/components/settings/DisciplineRulesCard';
import { AttendanceCoverageCard } from '@/components/settings/AttendanceCoverageCard';
import { StatutorySettingsCard } from '@/components/settings/StatutorySettingsCard';

export default function Settings() {
  const { user, userRole, signOut, staffData } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  // Device detection
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const browserInfo = navigator.userAgent.split(' ').slice(-1)[0].split('/')[0] || 'Browser';

  const handlePasswordChange = async () => {
    // Validation
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
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        toast.error('Current password is incorrect');
        setIsChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setPasswordChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');

      // Reset success state after 3 seconds
      setTimeout(() => setPasswordChangeSuccess(false), 3000);
    } catch (error: any) {
      console.error('Password change error:', error);
      toast.error(error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast.success('Signed out from all devices');
    } catch (error: any) {
      toast.error('Failed to sign out from all devices');
    }
  };

  const getRoleLabel = (role: string | null) => {
    if (!role) return 'User';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const lastSignIn = user?.last_sign_in_at 
    ? format(new Date(user.last_sign_in_at), 'dd MMM yyyy, hh:mm a')
    : 'N/A';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={t('settings')}
        description="Manage your account preferences and security settings"
      />

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Account Overview */}
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

        {/* Language Settings */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              {t('language')}
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
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Language preference is saved automatically
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="md:col-span-2">
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
                <span className="text-green-600 dark:text-green-400 font-medium text-sm sm:text-base">
                  Password changed successfully!
                </span>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="current-password" className="text-xs sm:text-sm">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 sm:h-11 pr-10 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-xs sm:text-sm">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 sm:h-11 pr-10 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Minimum 6 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-xs sm:text-sm">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 sm:h-11 pr-10 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="sm:col-span-3 flex justify-end pt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        size="sm"
                        disabled={!currentPassword || !newPassword || !confirmPassword || isChangingPassword}
                      >
                        {isChangingPassword ? (
                          <>
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            <span className="text-sm">Changing...</span>
                          </>
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
                        <AlertDialogAction onClick={handlePasswordChange} className="text-sm">
                          Confirm Change
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Actions */}
        <Card className="md:col-span-2">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Security Actions
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-col sm:flex-row gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 justify-center">
                    <LogOut className="h-4 w-4" />
                    <span className="text-sm">Sign Out All Devices</span>
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
                    <AlertDialogAction onClick={handleSignOutAllDevices} className="text-sm">
                      Sign Out All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="destructive" size="sm" className="gap-2 justify-center" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Sign Out</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Statutory Compliance (Owner) */}
        <StatutorySettingsCard />

        {/* Attendance Coverage (Owner) */}
        <AttendanceCoverageCard />

        {/* Discipline Rules (Owner) */}
        <DisciplineRulesCard />

        {/* Clear Transaction Data - Owner Only */}
        <ClearTransactionDataCard />

        {/* Expense Categories Management */}
        <ManageCategoriesCard />

        {/* Clubs Management */}
        <ManageClubsCard />
      </div>
    </div>
  );
}
