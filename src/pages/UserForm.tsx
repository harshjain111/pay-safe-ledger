import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, UserPlus, Eye, EyeOff, Loader2, Phone, Mail, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AppRole, StaffPublic } from '@/types/database';

export default function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isOwner } = useAuth();
  const isEditing = !!id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [showPassword, setShowPassword] = useState(false);

  // Form state - Auth & Role only
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('staff');
  const [isActive, setIsActive] = useState(true);
  const [linkedStaffId, setLinkedStaffId] = useState<string | null>(null);
  
  // Available staff for linking
  const [availableStaff, setAvailableStaff] = useState<StaffPublic[]>([]);

  useEffect(() => {
    if (!isOwner) {
      toast({
        title: 'Access Denied',
        description: 'Only owners can manage users.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    fetchAvailableStaff();
    
    if (isEditing) {
      fetchUserData();
    }
  }, [id, isOwner]);

  const fetchAvailableStaff = async () => {
    try {
      // Get staff without linked user_id (unlinked staff)
      const { data, error } = await supabase
        .from('staff_public')
        .select('*')
        .is('user_id', null)
        .eq('is_active', true);

      if (error) throw error;
      setAvailableStaff((data || []) as StaffPublic[]);
    } catch (error) {
      console.error('Error fetching available staff:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      // Fetch user details via edge function (gets auth metadata + staff data)
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-user?user_id=${id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.session?.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch user');
      }

      const userData = result.user;
      
      setRole(userData.role as AppRole);
      setFullName(userData.full_name || '');
      setPhone(userData.phone || '');
      setEmail(userData.email || '');
      setLinkedStaffId(userData.staff_id);
    } catch (error) {
      console.error('Error fetching user:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneInput = (value: string) => {
    return value.replace(/\D/g, '');
  };

  const handleSubmit = async () => {
    // Validation
    if (!fullName.trim()) {
      toast({ title: 'Validation Error', description: 'Full name is required.', variant: 'destructive' });
      return;
    }
    
    if (!isEditing) {
      const cleanPhone = formatPhoneInput(phone);
      if (cleanPhone.length < 10) {
        toast({ title: 'Validation Error', description: 'Please enter a valid phone number (min 10 digits).', variant: 'destructive' });
        return;
      }
      if (!password || password.length < 6) {
        toast({ title: 'Validation Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      if (isEditing) {
        // Update role only
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: role })
          .eq('user_id', id);

        if (roleError) throw roleError;

        toast({ 
          title: 'User Updated', 
          description: `Role has been updated to ${role}.`
        });
      } else {
        // Create new user via edge function
        const { data: session } = await supabase.auth.getSession();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.session?.access_token}`,
            },
            body: JSON.stringify({
              phone: formatPhoneInput(phone),
              password: password,
              full_name: fullName.trim(),
              email: email.trim() || null,
              role: role,
              is_active: isActive,
              link_staff_id: role === 'staff' ? linkedStaffId : null,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create user');
        }

        toast({ 
          title: 'User Created', 
          description: `${fullName} can now login using phone: ${formatPhoneInput(phone)}`
        });
      }

      navigate('/users');
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save user. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title={isEditing ? 'Edit User' : 'Add New User'}
        description={isEditing ? 'Update user role' : 'Create a new user account with login credentials'}
      >
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </PageHeader>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>User vs Staff:</strong> This form creates a login account only. 
          To add an employee to payroll, use "Add Staff" instead.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6">
        {/* Login Credentials - Only for new users */}
        {!isEditing && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Login Credentials</CardTitle>
              <CardDescription>
                User will login using their phone number and password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                      placeholder="9876543210"
                      className="pl-10"
                      maxLength={15}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will be their login identifier
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
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
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Information */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  disabled={isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="pl-10"
                    disabled={isEditing}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="ca">CA / Auditor</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {role === 'owner' && 'Full access to all features including salary'}
                  {role === 'admin' && 'Can approve requests and execute payouts (no salary access)'}
                  {role === 'accountant' && 'Can execute payouts and view ledger (no salary access)'}
                  {role === 'staff' && 'Can submit requests and view own data'}
                  {role === 'ca' && 'Read-only access to reports and audit log'}
                </p>
              </div>

              {!isEditing && (
                <div className="space-y-2">
                  <Label htmlFor="isActive">Status</Label>
                  <div className="flex items-center space-x-3 pt-2">
                    <Switch
                      id="isActive"
                      checked={isActive}
                      onCheckedChange={setIsActive}
                    />
                    <span className="text-sm">
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Link to existing staff - only for staff role */}
            {role === 'staff' && !isEditing && availableStaff.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="linkedStaff">Link to Existing Staff Record (Optional)</Label>
                <Select 
                  value={linkedStaffId || 'none'} 
                  onValueChange={(v) => setLinkedStaffId(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff to link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't link to staff record</SelectItem>
                    {availableStaff.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id!}>
                        {staff.full_name} ({staff.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link this user to an existing staff record that doesn't have a login yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => navigate('/users')}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEditing ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {isEditing ? <Save className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {isEditing ? 'Save Changes' : 'Create User'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
