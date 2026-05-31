import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Amount } from '@/components/ui/amount';
import { Separator } from '@/components/ui/separator';
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
import { ArrowLeft, Edit, Trash2, Phone, Mail, Building2, Briefcase, Calendar, User, Loader2, MapPin, Heart, Landmark, UserCog } from 'lucide-react';
import { StaffAttendanceSection } from '@/components/attendance/StaffAttendanceSection';
import { StaffDocumentsCard } from '@/components/staff/StaffDocumentsCard';
import { EmploymentHistoryCard } from '@/components/staff/EmploymentHistoryCard';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { Staff, AppRole } from '@/types/database';

export default function StaffDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isOwner, canViewSalaries, canEditStaff } = useAuth();
  
  const [staff, setStaff] = useState<Staff | null>(null);
  const [staffRole, setStaffRole] = useState<AppRole | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchStaffDetails();
    }
  }, [id]);

  const fetchStaffDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setStaff(data as Staff);

      // Fetch role if user_id exists
      if (data?.user_id) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user_id)
          .single();

        if (roleData) {
          setStaffRole(roleData.role as AppRole);
        }
      }

      // Fetch reporting manager name
      if (data?.reporting_manager_id) {
        const { data: mgr } = await supabase
          .from('staff')
          .select('full_name')
          .eq('id', data.reporting_manager_id)
          .single();
        if (mgr) setManagerName(mgr.full_name);
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({
        title: 'Error',
        description: 'Failed to load staff details.',
        variant: 'destructive',
      });
      navigate('/staff');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!staff) return;

    try {
      setIsDeleting(true);

      // Delete salary history first (configuration data, safe to delete)
      await supabase
        .from('salary_history')
        .delete()
        .eq('staff_id', staff.id);

      // Delete user role if exists
      if (staff.user_id) {
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', staff.user_id);
      }

      // Delete staff record
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staff.id);

      if (error) {
        if (error.message.includes('foreign key constraint')) {
          throw new Error('Cannot delete staff with financial records (ledger entries, expenses, settlements). Please deactivate instead.');
        }
        throw error;
      }

      toast({
        title: 'Staff Deleted',
        description: `${staff.full_name} has been removed from the system.`,
      });

      navigate('/staff');
    } catch (error: any) {
      console.error('Error deleting staff:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete staff.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: AppRole) => {
    const labels: Record<AppRole, string> = {
      owner: 'Owner',
      admin: 'Admin',
      accountant: 'Accountant',
      staff: 'Staff',
      ca: 'Chartered Accountant',
    };
    return labels[role] || role;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Staff member not found.</p>
        <Button variant="outline" onClick={() => navigate('/staff')} className="mt-4">
          Back to Staff List
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Staff Details"
        description="View staff member information"
      >
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/staff')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          {canEditStaff && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/staff/${staff.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          )}
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{staff.full_name}</strong>? 
                    This action cannot be undone. Their login access will also be revoked.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete Staff'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6">
        {/* Profile Card */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <Avatar className="h-20 w-20 text-2xl">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  {getInitials(staff.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <h2 className="text-2xl font-bold">{staff.full_name}</h2>
                <p className="text-muted-foreground font-mono">{staff.employee_id}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <StatusBadge status={staff.is_active ? 'active' : 'inactive'} />
                  {staffRole && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {getRoleLabel(staffRole)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Work Details */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{staff.phone || 'Not provided'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{staff.email || 'Not provided'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Work Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-medium">{staff.department || 'Not assigned'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Designation</p>
                  <p className="font-medium">{staff.designation || 'Not assigned'}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date of Joining</p>
                  <p className="font-medium">{format(new Date(staff.date_of_joining), 'dd MMMM yyyy')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Salary Information - Only visible to owners */}
        {canViewSalaries && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Salary Information</CardTitle>
              <CardDescription>Confidential - visible only to owners</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Salary</p>
                  <p className="text-2xl font-bold">
                    <Amount value={staff.monthly_salary} size="lg" />
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/ledger?staff=${staff.id}`}>
                    View Ledger
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance records */}
        <StaffAttendanceSection staffId={staff.id} />
      </div>
    </div>
  );
}
