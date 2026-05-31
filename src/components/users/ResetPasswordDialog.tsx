import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/lib/toast';
import { Key, Loader2, Eye, EyeOff } from 'lucide-react';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  onSuccess?: () => void;
}

const DEFAULT_PASSWORD = '123456';

export function ResetPasswordDialog({ 
  open, 
  onOpenChange, 
  userId, 
  userName,
  onSuccess 
}: ResetPasswordDialogProps) {
  const [resetType, setResetType] = useState<'default' | 'custom'>('default');
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    const newPassword = resetType === 'default' ? DEFAULT_PASSWORD : customPassword;

    if (resetType === 'custom' && newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsResetting(true);

    try {
      // Call edge function to reset password (requires service role)
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { 
          userId, 
          newPassword,
          userName 
        },
      });

      if (error) throw error;

      toast.success(`Password reset successfully for ${userName}`);
      
      // Create notification for the user
      await supabase.from('notifications').insert({
        user_id: userId,
        title: 'Password Reset',
        message: 'Your password has been reset by the Owner. Please change it in Settings.',
        type: 'warning',
      });

      onSuccess?.();
      onOpenChange(false);
      setCustomPassword('');
      setResetType('default');
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Reset password for <strong>{userName}</strong>. They will be notified about the change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={resetType} onValueChange={(v) => setResetType(v as 'default' | 'custom')}>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="default" id="default" />
              <Label htmlFor="default" className="flex-1 cursor-pointer">
                <div className="font-medium">Reset to Default Password</div>
                <div className="text-sm text-muted-foreground">
                  Password will be set to: <code className="bg-muted px-1.5 py-0.5 rounded">{DEFAULT_PASSWORD}</code>
                </div>
              </Label>
            </div>

            <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer">
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <Label htmlFor="custom" className="flex-1 cursor-pointer">
                <div className="font-medium">Set Custom Password</div>
                <div className="text-sm text-muted-foreground mb-2">
                  Enter a specific password for this user
                </div>
                {resetType === 'custom' && (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}
              </Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleReset} 
            disabled={isResetting || (resetType === 'custom' && customPassword.length < 6)}
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
