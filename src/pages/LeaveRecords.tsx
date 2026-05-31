 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/contexts/AuthContext';
 import { PageHeader } from '@/components/layout/PageHeader';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Input } from '@/components/ui/input';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from '@/components/ui/table';
 import { EmptyState } from '@/components/layout/EmptyState';
 import { ListSkeleton } from '@/components/layout/ListSkeleton';
 import { CreateLeaveDialog } from '@/components/leave/CreateLeaveDialog';
 import { LeaveApprovalDialog } from '@/components/leave/LeaveApprovalDialog';
 import { Plus, Calendar, Search, Clock, CheckCircle, XCircle, CalendarX, CalendarMinus, Eye } from 'lucide-react';
 import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
 import type { LeaveRecord, LeaveStatus } from '@/types/leave';
 import { LEAVE_TYPE_CONFIG, LEAVE_STATUS_LABELS } from '@/types/leave';
 import { cn } from '@/lib/utils';
 
 interface StaffOption {
   id: string;
   full_name: string;
   employee_id: string;
 }
 
 export default function LeaveRecords() {
   const { user, userRole, staffData } = useAuth();
   const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
   const [staff, setStaff] = useState<StaffOption[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [showCreateDialog, setShowCreateDialog] = useState(false);
   const [showApprovalDialog, setShowApprovalDialog] = useState(false);
   const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
 
   // Filters
   const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
   const [selectedStaffId, setSelectedStaffId] = useState('all');
   const [selectedStatus, setSelectedStatus] = useState<string>('all');
   const [searchQuery, setSearchQuery] = useState('');
 
   const isStaff = userRole === 'staff';
   const canApprove = userRole === 'owner' || userRole === 'admin' || userRole === 'accountant';
 
   const fetchStaff = useCallback(async () => {
     try {
       const { data, error } = await supabase
         .from('staff')
         .select('id, full_name, employee_id')
         .eq('is_active', true)
         .order('full_name');
 
       if (error) throw error;
       setStaff(data || []);
     } catch (error) {
       console.error('Error fetching staff:', error);
     }
   }, []);

   const fetchLeaveRecords = useCallback(async () => {
     try {
       setIsLoading(true);
 
       const monthStart = startOfMonth(new Date(selectedMonth + '-01'));
       const monthEnd = endOfMonth(new Date(selectedMonth + '-01'));
 
       let query = supabase
         .from('leave_records')
         .select(`
           *,
           staff:staff_id (
             id,
             full_name,
             employee_id
           )
         `)
         .gte('leave_date', format(monthStart, 'yyyy-MM-dd'))
         .lte('leave_date', format(monthEnd, 'yyyy-MM-dd'))
         .order('leave_date', { ascending: false });
 
       if (selectedStaffId !== 'all') {
         query = query.eq('staff_id', selectedStaffId);
       }
 
       if (selectedStatus !== 'all') {
         query = query.eq('status', selectedStatus as 'pending' | 'approved' | 'rejected');
       }
 
       const { data, error } = await query;
 
       if (error) throw error;
       setLeaveRecords((data as unknown as LeaveRecord[]) || []);
     } catch (error) {
       console.error('Error fetching leave records:', error);
     } finally {
       setIsLoading(false);
     }
   }, [selectedMonth, selectedStaffId, selectedStatus]);

   useEffect(() => {
     fetchLeaveRecords();
     if (!isStaff) {
       fetchStaff();
     }
   }, [fetchLeaveRecords, fetchStaff, isStaff]);

   const filteredRecords = leaveRecords.filter((record) => {
     if (searchQuery) {
       const search = searchQuery.toLowerCase();
       return (
         record.staff?.full_name?.toLowerCase().includes(search) ||
         record.staff?.employee_id?.toLowerCase().includes(search) ||
         record.remarks?.toLowerCase().includes(search)
       );
     }
     return true;
   });
 
   // Stats
   const pendingCount = leaveRecords.filter(r => r.status === 'pending').length;
   const approvedCount = leaveRecords.filter(r => r.status === 'approved').length;
   const unpaidPenaltyCount = leaveRecords.filter(r => 
     r.status === 'approved' && (r.leave_type === 'unpaid' || r.leave_type === 'penalty')
   ).length;
   const totalDeductionDays = leaveRecords
     .filter(r => r.status === 'approved')
     .reduce((sum, r) => sum + r.deduction_days, 0);
 
   const monthOptions = Array.from({ length: 12 }, (_, i) => {
     const date = subMonths(new Date(), i);
     return {
       value: format(date, 'yyyy-MM'),
       label: format(date, 'MMMM yyyy'),
     };
   });
 
   const getStatusIcon = (status: LeaveStatus) => {
     switch (status) {
       case 'pending': return <Clock className="h-4 w-4" />;
       case 'approved': return <CheckCircle className="h-4 w-4" />;
       case 'rejected': return <XCircle className="h-4 w-4" />;
     }
   };
 
   const getStatusVariant = (status: LeaveStatus): 'default' | 'secondary' | 'destructive' => {
     switch (status) {
       case 'pending': return 'secondary';
       case 'approved': return 'default';
       case 'rejected': return 'destructive';
     }
   };
 
   const handleReviewClick = (record: LeaveRecord) => {
     setSelectedLeave(record);
     setShowApprovalDialog(true);
   };
 
   return (
     <div className="space-y-4 md:space-y-6">
       <PageHeader
         title={isStaff ? 'My Leaves' : 'Leave Records'}
         description={isStaff ? 'Track your leave requests and approvals' : 'Manage staff leave and salary deductions'}
       >
         <Button onClick={() => setShowCreateDialog(true)}>
           <Plus className="mr-2 h-4 w-4" />
           {isStaff ? 'Request Leave' : 'Record Leave'}
         </Button>
       </PageHeader>
 
       {/* Clickable Summary Tiles */}
       <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
         {/* Total Leaves */}
         <Card 
           className={cn(
             "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
             selectedStatus === 'approved' && "ring-2 ring-primary"
           )}
           onClick={() => setSelectedStatus('approved')}
         >
           <CardHeader className="pb-2">
             <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
               <Calendar className="h-3.5 w-3.5" />
               {isStaff ? 'My Leaves' : 'Total Leaves'}
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{approvedCount}</div>
             <p className="text-xs text-muted-foreground mt-0.5">This month</p>
           </CardContent>
         </Card>
 
         {/* Unpaid/Penalty (Admin only) */}
         {!isStaff && (
           <Card 
             className="cursor-pointer transition-all hover:shadow-md hover:border-destructive/50"
             onClick={() => setSelectedStatus('approved')}
           >
             <CardHeader className="pb-2">
               <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                 <CalendarX className="h-3.5 w-3.5" />
                 Unpaid / Penalty
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold text-destructive">{unpaidPenaltyCount}</div>
               <p className="text-xs text-muted-foreground mt-0.5">With salary impact</p>
             </CardContent>
           </Card>
         )}
 
         {/* Total Deduction Days */}
         <Card 
           className="cursor-pointer transition-all hover:shadow-md"
           onClick={() => setSelectedStatus('approved')}
         >
           <CardHeader className="pb-2">
             <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
               <CalendarMinus className="h-3.5 w-3.5" />
               {isStaff ? 'Salary Impact' : 'Deduction Days'}
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">{totalDeductionDays}</div>
             <p className="text-xs text-muted-foreground mt-0.5">
               {isStaff ? `${totalDeductionDays} day${totalDeductionDays !== 1 ? 's' : ''} deducted` : 'Total days'}
             </p>
           </CardContent>
         </Card>
 
         {/* Pending */}
         <Card 
           className={cn(
             "cursor-pointer transition-all hover:shadow-md",
             selectedStatus === 'pending' && "ring-2 ring-warning",
             pendingCount > 0 && "border-warning/50"
           )}
           onClick={() => setSelectedStatus('pending')}
         >
           <CardHeader className="pb-2">
             <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
               <Clock className="h-3.5 w-3.5" />
               {isStaff ? 'Awaiting Approval' : 'Pending Review'}
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className={cn("text-2xl font-bold", pendingCount > 0 && "text-warning")}>
               {pendingCount}
             </div>
             <p className="text-xs text-muted-foreground mt-0.5">
               {isStaff ? 'Waiting' : 'Need action'}
             </p>
           </CardContent>
         </Card>
       </div>
 
       {/* Filters */}
       <Card>
         <CardContent className="py-3">
           <div className="flex flex-col gap-3 md:flex-row md:items-center">
             <div className="flex-1">
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                 <Input
                   placeholder={isStaff ? "Search..." : "Search by name..."}
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-10 h-9"
                 />
               </div>
             </div>
 
             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
               <SelectTrigger className="w-full md:w-40 h-9">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 {monthOptions.map((m) => (
                   <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                 ))}
               </SelectContent>
             </Select>
 
             {!isStaff && (
               <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                 <SelectTrigger className="w-full md:w-40 h-9">
                   <SelectValue placeholder="All Staff" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Staff</SelectItem>
                   {staff.map((s) => (
                     <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             )}
 
             <Select value={selectedStatus} onValueChange={setSelectedStatus}>
               <SelectTrigger className="w-full md:w-32 h-9">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All</SelectItem>
                 <SelectItem value="pending">Pending</SelectItem>
                 <SelectItem value="approved">Approved</SelectItem>
                 <SelectItem value="rejected">{isStaff ? 'Declined' : 'Rejected'}</SelectItem>
               </SelectContent>
             </Select>
           </div>
         </CardContent>
       </Card>
 
       {/* Leave Table */}
       <Card>
         <CardContent className="p-0">
           {isLoading ? (
             <ListSkeleton variant="rows" />
           ) : filteredRecords.length === 0 ? (
             <EmptyState
               icon={Calendar}
               title={isStaff ? "No leaves yet" : "No leave records"}
               description={isStaff ? 'Need time off? Submit a leave request.' : 'No records match the selected filters.'}
               action={
                 <Button onClick={() => setShowCreateDialog(true)}>
                   <Plus className="mr-2 h-4 w-4" />
                   {isStaff ? 'Request Leave' : 'Record Leave'}
                 </Button>
               }
             />
           ) : (
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     {!isStaff && <TableHead>Staff</TableHead>}
                     <TableHead>Date</TableHead>
                     <TableHead>Type</TableHead>
                     <TableHead className="text-center">Deduction</TableHead>
                     <TableHead>Status</TableHead>
                     {!isStaff && <TableHead>Approved By</TableHead>}
                     <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {filteredRecords.map((record) => (
                     <TableRow key={record.id}>
                       {/* Staff Name */}
                       {!isStaff && (
                         <TableCell>
                           <div className="font-medium">{record.staff?.full_name}</div>
                           <div className="text-xs text-muted-foreground">{record.staff?.employee_id}</div>
                         </TableCell>
                       )}
                       
                       {/* Date */}
                       <TableCell>
                         <div className="font-medium">{format(new Date(record.leave_date), 'dd MMM')}</div>
                         <div className="text-xs text-muted-foreground">{format(new Date(record.leave_date), 'EEEE')}</div>
                       </TableCell>
                       
                       {/* Type */}
                       <TableCell>
                         <Badge variant="outline">
                           {isStaff 
                             ? (record.leave_type === 'paid' ? 'Paid' : 'Leave')
                             : LEAVE_TYPE_CONFIG[record.leave_type]?.label
                           }
                         </Badge>
                       </TableCell>
                       
                       {/* Deduction */}
                       <TableCell className="text-center">
                         {isStaff ? (
                           <span className={cn(
                             "text-sm font-medium",
                             record.deduction_days > 0 ? "text-destructive" : "text-success"
                           )}>
                             {record.deduction_days === 0 ? 'None' : `-${record.deduction_days}d`}
                           </span>
                         ) : (
                           <span className="font-medium">{record.deduction_days}d</span>
                         )}
                       </TableCell>
                       
                       {/* Status */}
                       <TableCell>
                         {isStaff ? (
                           <div className="flex items-center gap-1.5">
                             {getStatusIcon(record.status)}
                             <span className={cn(
                               "text-sm",
                               record.status === 'pending' && "text-warning",
                               record.status === 'approved' && "text-success",
                               record.status === 'rejected' && "text-destructive"
                             )}>
                               {record.status === 'pending' ? 'Waiting' : 
                                record.status === 'approved' ? 'Approved' : 'Declined'}
                             </span>
                           </div>
                         ) : (
                           <Badge variant={getStatusVariant(record.status)} className="gap-1">
                             {getStatusIcon(record.status)}
                             {LEAVE_STATUS_LABELS[record.status]}
                           </Badge>
                         )}
                       </TableCell>
                       
                       {/* Approved By */}
                       {!isStaff && (
                         <TableCell className="text-sm text-muted-foreground">
                           {record.approved_by ? 'Manager' : '-'}
                         </TableCell>
                       )}
                       
                       {/* Actions */}
                       <TableCell className="text-right">
                         {canApprove && record.status === 'pending' ? (
                           <Button size="sm" onClick={() => handleReviewClick(record)}>
                             Review
                           </Button>
                         ) : (
                           <Button size="sm" variant="ghost">
                             <Eye className="h-4 w-4" />
                           </Button>
                         )}
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </div>
           )}
         </CardContent>
       </Card>
 
       {/* Dialogs */}
       <CreateLeaveDialog
         open={showCreateDialog}
         onOpenChange={setShowCreateDialog}
         onSuccess={fetchLeaveRecords}
         staffId={isStaff ? staffData?.id : undefined}
       />
 
       <LeaveApprovalDialog
         open={showApprovalDialog}
         onOpenChange={setShowApprovalDialog}
         leaveRecord={selectedLeave}
         onSuccess={fetchLeaveRecords}
       />
     </div>
   );
 }