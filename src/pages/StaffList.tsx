import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Amount } from '@/components/ui/amount';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Users, MoreHorizontal, Eye, Edit, FileText, Trash2, RotateCcw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
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
import type { Staff } from '@/types/database';
import { staffSelect } from '@/lib/staff-fields';

export default function StaffList() {
  const { canViewSalaries, isOwner, isAdmin, isAccountant, canEditStaff } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'removed'>('active');
  
  // Owner, Admin, and Accountant can add staff
  const canAddStaff = isOwner || isAdmin || isAccountant;

  useEffect(() => {
    // Re-fetch when the owner flag resolves/changes: the selected columns depend
    // on isOwner (owners get salary, others don't), so a stale value must refetch.
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const fetchStaff = async () => {
    try {
      // Non-owners receive only non-salary columns (staffSelect), so confidential
      // compensation data is never transmitted to accountant/admin/staff sessions.
      const { data, error } = await supabase
        .from('staff')
        .select(staffSelect(isOwner))
        .order('full_name');

      if (error) throw error;
      setStaff((data as unknown as Staff[]) || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeCount = staff.filter(s => s.is_active).length;
  const removedCount = staff.filter(s => !s.is_active).length;

  const filteredStaff = staff
    .filter(s => (view === 'active' ? s.is_active : !s.is_active))
    .filter(s =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleDelete = async (member: Staff) => {
    try {
      setDeletingId(member.id);

      // Soft remove: deactivate to preserve historical records (advances, ledger, settlements)
      const { error } = await supabase
        .from('staff')
        .update({ is_active: false })
        .eq('id', member.id);

      if (error) throw error;

      toast({
        title: 'Staff Removed',
        description: `${member.full_name} is hidden from active lists. History is preserved under Removed Staff.`,
      });

      fetchStaff();
    } catch (error: any) {
      console.error('Error removing staff:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove staff.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (member: Staff) => {
    try {
      setDeletingId(member.id);
      const { error } = await supabase
        .from('staff')
        .update({ is_active: true })
        .eq('id', member.id);
      if (error) throw error;
      toast({
        title: 'Staff Restored',
        description: `${member.full_name} is active again.`,
      });
      fetchStaff();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to restore staff.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Staff Management"
        description="Manage your team members"
      >
        {canAddStaff && (
          <Link to="/staff/new">
            <Button className="text-sm sm:text-base px-3 sm:px-4">
              <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add Staff</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </Link>
        )}
      </PageHeader>

      {/* Active / Removed tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'active' | 'removed')}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="removed">Removed ({removedCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <Card className="mb-4 sm:mb-6">
        <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search staff"
              placeholder="Search by name, ID, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-sm sm:text-base"
            />
          </div>
        </CardContent>
      </Card>


      {/* Staff List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <ListSkeleton variant="rows" />
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No staff found"
              description={searchQuery ? "Try adjusting your search" : "Add your first team member"}
              action={
                !searchQuery && canAddStaff
                  ? <Link to="/staff/new"><Button>Add Staff</Button></Link>
                  : undefined
              }
            />
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden divide-y">
                {filteredStaff.map((member) => (
                  <div key={member.id} className="p-3 sm:p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                            {getInitials(member.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base truncate">{member.full_name}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {member.employee_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <StatusBadge status={member.is_active ? 'active' : 'inactive'} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Staff actions" className="h-7 w-7 sm:h-8 sm:w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem asChild>
                              <Link to={`/staff/${member.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {canEditStaff && (
                              <DropdownMenuItem asChild>
                                <Link to={`/staff/${member.id}/edit`}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link to={`/ledger?staff=${member.id}`}>
                                <FileText className="mr-2 h-4 w-4" />
                                View Ledger
                              </Link>
                            </DropdownMenuItem>
                            {isOwner && member.is_active && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove Staff</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <strong>{member.full_name}</strong> will be hidden from all active staff lists, dropdowns, and reports. All historical records (advances, ledger, settlements) are preserved and accessible under the <strong>Removed</strong> tab. You can restore them anytime.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(member)}
                                      disabled={deletingId === member.id}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deletingId === member.id ? 'Removing...' : 'Remove'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {isOwner && !member.is_active && (
                              <DropdownMenuItem
                                onSelect={(e) => { e.preventDefault(); handleRestore(member); }}
                                disabled={deletingId === member.id}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {deletingId === member.id ? 'Restoring...' : 'Restore'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
                      <span>{member.designation || member.department || '-'}</span>
                      {canViewSalaries && (
                        member.monthly_salary > 0 ? (
                          <Amount value={member.monthly_salary} size="sm" />
                        ) : (
                          <span className="text-warning text-[10px] sm:text-xs font-medium">Salary not set</span>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      {canViewSalaries && (
                        <TableHead className="text-right">Salary</TableHead>
                      )}
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStaff.map((member) => (
                      <TableRow key={member.id} className="hover:bg-secondary/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {getInitials(member.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.full_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {member.employee_id}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{member.department || '-'}</TableCell>
                        <TableCell>{member.designation || '-'}</TableCell>
                        {canViewSalaries && (
                          <TableCell className="text-right">
                            {member.monthly_salary > 0 ? (
                              <Amount value={member.monthly_salary} />
                            ) : (
                              <span className="text-warning text-sm font-medium">Salary not set</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <StatusBadge status={member.is_active ? 'active' : 'inactive'} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(member.date_of_joining), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Staff actions" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem asChild>
                                <Link to={`/staff/${member.id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              {canEditStaff && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/staff/${member.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem asChild>
                                <Link to={`/ledger?staff=${member.id}`}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  View Ledger
                                </Link>
                              </DropdownMenuItem>
                              {isOwner && member.is_active && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remove
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove Staff</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        <strong>{member.full_name}</strong> will be hidden from all active staff lists, dropdowns, and reports. All historical records (advances, ledger, settlements) are preserved and accessible under the <strong>Removed</strong> tab. You can restore them anytime.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(member)}
                                        disabled={deletingId === member.id}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {deletingId === member.id ? 'Removing...' : 'Remove'}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {isOwner && !member.is_active && (
                                <DropdownMenuItem
                                  onSelect={(e) => { e.preventDefault(); handleRestore(member); }}
                                  disabled={deletingId === member.id}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  {deletingId === member.id ? 'Restoring...' : 'Restore'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}