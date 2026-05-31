import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AmountInput } from '@/components/ui/amount';
import { ArrowLeft, CalendarIcon, Save, UserPlus, Eye, EyeOff, Loader2, Phone, RefreshCw, AlertCircle, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { uploadStaffPhoto } from '@/lib/staff-uploads';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function StaffForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isOwner, isAdmin, isAccountant } = useAuth();
  const isEditing = !!id;
  
  // Determine who can access this page
  // Owner: full access (add/edit with salary)
  // Admin/Accountant: can add staff without salary, can edit non-salary fields
  const canAddStaff = isOwner || isAdmin || isAccountant;
  const canSetSalary = isOwner;
  const canEditStaff = isOwner || isAdmin || isAccountant; // Non-salary fields for non-owners
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<'staff' | 'accountant' | 'admin'>('staff');
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [dateOfJoining, setDateOfJoining] = useState<Date>(new Date());
  const [isActive, setIsActive] = useState(true);
  const [salaryChangeReason, setSalaryChangeReason] = useState('');
  const [originalSalary, setOriginalSalary] = useState(0);
  const [existingUserId, setExistingUserId] = useState<string | null>(null);

  // Optional HR profile fields (edit mode)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [reportingManagerId, setReportingManagerId] = useState<string>('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [managers, setManagers] = useState<{ id: string; full_name: string }[]>([]);


  // Auto-generate employee ID on mount for new staff
  useEffect(() => {
    if (!isEditing) {
      setEmployeeId(generateEmployeeId());
    }
  }, [isEditing]);

  useEffect(() => {
    // Access control
    if (!canAddStaff && !isEditing) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to add staff.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }
    
    // Check edit permissions
    if (isEditing && !canEditStaff) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit staff.',
        variant: 'destructive',
      });
      navigate('/staff');
      return;
    }
    
    if (isEditing) {
      fetchStaffData();
    }
  }, [id, canAddStaff, canEditStaff]);

  const fetchStaffData = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setFullName(data.full_name);
        setEmployeeId(data.employee_id);
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setDepartment(data.department || '');
        setDesignation(data.designation || '');
        setMonthlySalary(Number(data.monthly_salary));
        setOriginalSalary(Number(data.monthly_salary));
        setDateOfJoining(new Date(data.date_of_joining));
        setIsActive(data.is_active ?? true);
        setExistingUserId(data.user_id);

        // Fetch role if user_id exists
        if (data.user_id) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', data.user_id)
            .single();

          if (roleData && (roleData.role === 'staff' || roleData.role === 'accountant' || roleData.role === 'admin')) {
            setRole(roleData.role);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({
        title: 'Error',
        description: 'Failed to load staff data.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateEmployeeId = () => {
    const prefix = 'EMP';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(100 + Math.random() * 900);
    return `${prefix}${timestamp}${random}`;
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
    if (!employeeId.trim()) {
      toast({ title: 'Validation Error', description: 'Employee ID is required.', variant: 'destructive' });
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
    
    // Salary validation only for owner, or when editing
    if (canSetSalary && monthlySalary <= 0 && isEditing) {
      toast({ title: 'Validation Error', description: 'Monthly salary must be greater than 0.', variant: 'destructive' });
      return;
    }

    // Check if salary changed and requires reason
    const salaryChanged = isEditing && monthlySalary !== originalSalary;
    if (salaryChanged && !salaryChangeReason.trim()) {
      toast({ title: 'Validation Error', description: 'Please provide a reason for salary change.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);

      if (isEditing) {
        // Update existing staff
        // Non-owners can only update non-salary fields
        const updateData: Record<string, unknown> = {
          full_name: fullName.trim(),
          employee_id: employeeId.trim(),
          phone: formatPhoneInput(phone) || null,
          email: email.trim() || null,
          department: department.trim() || null,
          designation: designation.trim() || null,
          date_of_joining: format(dateOfJoining, 'yyyy-MM-dd'),
          is_active: isActive,
        };
        
        // Only owner can update salary
        if (canSetSalary) {
          updateData.monthly_salary = monthlySalary;
        }
        
        const { error: staffError } = await supabase
          .from('staff')
          .update(updateData)
          .eq('id', id);

        if (staffError) throw staffError;

        // Update role if user_id exists
        if (existingUserId) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role: role })
            .eq('user_id', existingUserId);

          if (roleError) console.error('Role update error:', roleError);
        }

        // If salary changed (and owner updated it), record in salary history
        if (salaryChanged && canSetSalary) {
          // Close previous salary history record
          await supabase
            .from('salary_history')
            .update({ effective_to: format(new Date(), 'yyyy-MM-dd') })
            .eq('staff_id', id)
            .is('effective_to', null);

          // Create new salary history record
          const { error: historyError } = await supabase
            .from('salary_history')
            .insert({
              staff_id: id,
              monthly_salary: monthlySalary,
              effective_from: format(new Date(), 'yyyy-MM-dd'),
              changed_by: user?.id,
              change_reason: salaryChangeReason.trim(),
            });

          if (historyError) throw historyError;
        }

        toast({ title: 'Staff Updated', description: `${fullName} has been updated successfully.` });
      } else {
        // Create new staff with auth user via edge function
        const { data: session } = await supabase.auth.getSession();
        
        // For non-owner, salary is 0 (owner will set it later)
        const salaryToSet = canSetSalary ? monthlySalary : 0;
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-user`,
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
              role: role,
              staff_data: {
                employee_id: employeeId.trim(),
                email: email.trim() || null,
                department: department.trim() || null,
                designation: designation.trim() || null,
                monthly_salary: salaryToSet,
                date_of_joining: format(dateOfJoining, 'yyyy-MM-dd'),
                is_active: isActive,
              },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create staff');
        }

        // If created by Admin/Accountant (without salary), notify Owner
        if (!canSetSalary) {
          const { data: owners } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'owner');
          
          if (owners && result.staff_id) {
            for (const owner of owners) {
              await supabase.rpc('create_notification', {
                _user_id: owner.user_id,
                _title: 'Salary Required for New Staff',
                _message: `${fullName} has been added by ${isAdmin ? 'Admin' : 'Accountant'}. Please set their monthly salary.`,
                _type: 'warning',
                _reference_type: 'staff',
                _reference_id: result.staff_id,
              });
            }
          }
        }

        toast({ 
          title: 'Staff Created', 
          description: canSetSalary 
            ? `${fullName} has been added. They can login using phone: ${formatPhoneInput(phone)}` 
            : `${fullName} has been added. Owner has been notified to set their salary.`
        });
      }

      navigate('/staff');
    } catch (error: any) {
      console.error('Error saving staff:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save staff. Please try again.',
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={isEditing ? 'Edit Staff' : 'Add New Staff'}
        description={isEditing ? 'Update staff information' : 'Add a new team member with login credentials'}
      >
        <Button variant="ghost" size="sm" onClick={() => navigate('/staff')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </PageHeader>

      {/* Non-owner adding staff notice */}
      {!isEditing && !canSetSalary && (
        <Alert className="border-warning bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            You can add staff members, but the Owner will need to set their salary before salary settlements can be processed.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Login Credentials - Only for new staff */}
        {!isEditing && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Login Credentials</CardTitle>
              <CardDescription>
                Staff will login using their phone number and password
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                  <p className="text-xs text-muted-foreground">
                    Share this password securely with the staff member
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personal Information */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="employeeId"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="EMP1234"
                      disabled={isEditing}
                      className="flex-1"
                    />
                    {!isEditing && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={() => setEmployeeId(generateEmployeeId())}
                        className="shrink-0"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-generated unique ID</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {isEditing && (
                  <div className="space-y-2">
                    <Label htmlFor="editPhone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="editPhone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                        placeholder="9876543210"
                        className="pl-10"
                        disabled
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Phone number cannot be changed</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Joining</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !dateOfJoining && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateOfJoining ? format(dateOfJoining, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-popover" align="start">
                      <Calendar
                        mode="single"
                        selected={dateOfJoining}
                        onSelect={(date) => setDateOfJoining(date || new Date())}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Details */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Work Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Operations"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="Manager"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>System Role *</Label>
                <Select 
                  value={role} 
                  onValueChange={(v) => setRole(v as 'staff' | 'accountant' | 'admin')}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="staff">Staff</SelectItem>
                    {/* Only Owner can assign Admin/Accountant roles */}
                    {isOwner && (
                      <>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {role === 'staff' && 'Can view own data, submit expenses and payment requests'}
                  {role === 'accountant' && 'Can record payments, reimburse expenses, export reports (no salary visibility)'}
                  {role === 'admin' && 'Can approve expenses and requests, record payments (no salary visibility)'}
                </p>
                {/* Show warning for non-owners */}
                {!isOwner && (
                  <p className="text-xs text-warning">
                    Only Owner can assign Admin or Accountant roles. Staff can be upgraded later by Owner.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Salary Information - Only visible to Owner */}
        {canSetSalary && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Salary Information</CardTitle>
              <CardDescription>
                This information is confidential and only visible to owners
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Monthly Salary (₹) *</Label>
                <AmountInput
                  value={monthlySalary}
                  onChange={setMonthlySalary}
                  placeholder="0.00"
                />
              </div>

              {/* Salary change reason (only for editing) */}
              {isEditing && monthlySalary !== originalSalary && (
                <div className="space-y-2 p-4 bg-warning/10 rounded-lg border border-warning/20">
                  <Label htmlFor="salaryReason">Reason for Salary Change *</Label>
                  <Textarea
                    id="salaryReason"
                    value={salaryChangeReason}
                    onChange={(e) => setSalaryChangeReason(e.target.value)}
                    placeholder="Annual increment, promotion, etc."
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Previous: ₹{originalSalary.toLocaleString('en-IN')} → New: ₹{monthlySalary.toLocaleString('en-IN')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="isActive" className="text-base font-medium">Active Status</Label>
                <p className="text-sm text-muted-foreground">
                  Inactive staff cannot login or receive payments
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pb-6">
          <Button variant="outline" onClick={() => navigate('/staff')} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 sm:flex-none sm:min-w-[160px]">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? 'Saving...' : 'Creating...'}
              </>
            ) : isEditing ? (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Create Staff
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
