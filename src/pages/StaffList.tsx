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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Users, MoreHorizontal, Eye, Edit, FileText, ChevronDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import type { Staff } from '@/types/database';
import { staffSelect } from '@/lib/staff-fields';
import { StaffStatusDialog, STAFF_STATUS_LABEL, type StaffStatus } from '@/components/staff/StaffStatusDialog';
import { cn } from '@/lib/utils';

type ViewKey = 'active' | 'inactive' | 'left' | 'terminated';

const STATUS_DOT: Record<StaffStatus, string> = {
  active: 'bg-success',
  inactive: 'bg-warning',
  left: 'bg-destructive',
  terminated: 'bg-destructive',
};

const STATUS_TEXT: Record<StaffStatus, string> = {
  active: 'text-success',
  inactive: 'text-warning',
  left: 'text-destructive',
  terminated: 'text-destructive',
};

function getStatus(member: Staff): StaffStatus {
  return (member.status as StaffStatus) || (member.is_active ? 'active' : 'inactive');
}

export default function StaffList() {
  const { canViewSalaries, isOwner, isAdmin, isAccountant, canEditStaff } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('active');

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    staff: Staff | null;
    next: StaffStatus;
  }>({ open: false, staff: null, next: 'active' });

  const canAddStaff = isOwner || isAdmin || isAccountant;
  const canChangeStatus = isOwner || isAdmin;

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const fetchStaff = async () => {
    try {
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

  const counts = staff.reduce(
    (acc, s) => {
      const st = getStatus(s);
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    { active: 0, inactive: 0, left: 0, terminated: 0 } as Record<StaffStatus, number>,
  );

  const filteredStaff = staff
    .filter((s) => getStatus(s) === view)
    .filter(
      (s) =>
        s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const requestStatusChange = (member: Staff, next: StaffStatus) => {
    const current = getStatus(member);
    if (current === next) return;
    setStatusDialog({ open: true, staff: member, next });
  };

  const StatusPill = ({ member }: { member: Staff }) => {
    const status = getStatus(member);
    const pill = (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
        <span className={STATUS_TEXT[status]}>{STAFF_STATUS_LABEL[status]}</span>
        {canChangeStatus && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </span>
    );

    if (!canChangeStatus) return pill;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-md px-2 py-1 hover:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Change status"
          >
            {pill}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover">
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(v) => requestStatusChange(member, v as StaffStatus)}
          >
            {(['active', 'inactive', 'left', 'terminated'] as StaffStatus[]).map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                <span className={cn('mr-2 inline-block h-2 w-2 rounded-full', STATUS_DOT[s])} />
                {STAFF_STATUS_LABEL[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader title="Staff Management" description="Manage your team members">
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

      <Tabs value={view} onValueChange={(v) => setView(v as ViewKey)}>
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({counts.inactive})</TabsTrigger>
          <TabsTrigger value="left">Left ({counts.left})</TabsTrigger>
          <TabsTrigger value="terminated">Terminated ({counts.terminated})</TabsTrigger>
        </TabsList>
      </Tabs>

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

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <ListSkeleton variant="rows" />
          ) : filteredStaff.length === 0 ? (
            <EmptyState
              icon={Users}
              title={`No ${STAFF_STATUS_LABEL[view as StaffStatus].toLowerCase()} staff`}
              description={searchQuery ? 'Try adjusting your search' : view === 'active' ? 'Add your first team member' : 'Nothing here yet'}
              action={
                !searchQuery && canAddStaff && view === 'active'
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
                          <p className="text-[10px] sm:text-xs text-muted-foreground">{member.employee_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <StatusPill member={member} />
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
                    {(view === 'left' || view === 'inactive' || view === 'terminated') && member.date_of_leaving && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        {view === 'terminated' ? 'Terminated' : 'Left'} on {format(new Date(member.date_of_leaving), 'dd MMM yyyy')}
                        {member.separation_reason ? ` — ${member.separation_reason}` : ''}
                      </p>
                    )}
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
                      {canViewSalaries && <TableHead className="text-right">Salary</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>{view === 'left' || view === 'terminated' ? 'Date of Leaving' : 'Joined'}</TableHead>
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
                              <p className="text-sm text-muted-foreground">{member.employee_id}</p>
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
                          <StatusPill member={member} />
                          {(view === 'left' || view === 'terminated') && member.separation_reason && (
                            <p className="text-xs text-muted-foreground mt-1 max-w-[260px] truncate" title={member.separation_reason}>
                              {member.separation_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {view === 'left' || view === 'terminated'
                            ? member.date_of_leaving
                              ? format(new Date(member.date_of_leaving), 'dd MMM yyyy')
                              : '-'
                            : format(new Date(member.date_of_joining), 'dd MMM yyyy')}
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

      {statusDialog.staff && (
        <StaffStatusDialog
          open={statusDialog.open}
          onOpenChange={(o) => setStatusDialog((s) => ({ ...s, open: o }))}
          staffId={statusDialog.staff.id}
          staffName={statusDialog.staff.full_name}
          nextStatus={statusDialog.next}
          onSaved={fetchStaff}
        />
      )}
    </div>
  );
}
