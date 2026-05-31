 import { useState, useEffect, useMemo, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { toAmount } from '@/lib/utils';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import { Button } from '@/components/ui/button';
 import { Calendar } from '@/components/ui/calendar';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import { Amount } from '@/components/ui/amount';
 import { Badge } from '@/components/ui/badge';
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
   TableFooter,
 } from '@/components/ui/table';
 import { CalendarIcon, CheckCircle, Clock, XCircle } from 'lucide-react';
 import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
 import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type ExpenseStatus } from '@/types/database';
 
 interface Event {
   id: string;
   event_date: string;
   location: string;
   client_name: string | null;
 }
 
 interface Staff {
   id: string;
   full_name: string;
   employee_id: string;
 }
 
 interface DateRange {
   from: Date;
   to: Date;
 }
 
 type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'custom';
 
 export function StaffExpenseReport() {
   const [events, setEvents] = useState<Event[]>([]);
   const [staff, setStaff] = useState<Staff[]>([]);
   const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
   const [selectedEventId, setSelectedEventId] = useState<string>('all');
   const [datePreset, setDatePreset] = useState<DatePreset>('last30');
   const [dateRange, setDateRange] = useState<DateRange>({
     from: subDays(new Date(), 30),
     to: new Date(),
   });
   const [expenses, setExpenses] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(false);
 
   useEffect(() => {
     fetchFiltersData();
   }, []);
 
   useEffect(() => {
     const now = new Date();
     switch (datePreset) {
       case 'last7':
         setDateRange({ from: subDays(now, 7), to: now });
         break;
       case 'last30':
         setDateRange({ from: subDays(now, 30), to: now });
         break;
       case 'thisMonth':
         setDateRange({ from: startOfMonth(now), to: endOfMonth(now) });
         break;
     }
   }, [datePreset]);
 
   const fetchFiltersData = async () => {
     const [eventsRes, staffRes] = await Promise.all([
       supabase.from('events').select('id, event_date, location, client_name').order('event_date', { ascending: false }),
       supabase.from('staff_public').select('id, full_name, employee_id').order('full_name'),
     ]);
     setEvents(eventsRes.data || []);
     setStaff((staffRes.data || []) as Staff[]);
   };
 
   const fetchExpenses = useCallback(async () => {
     setIsLoading(true);
     try {
       let query = supabase
         .from('expenses')
         .select(`
           id,
           amount,
           category,
           description,
           expense_date,
           status,
           event_id,
           staff_id,
           staff:staff_public(full_name, employee_id),
           event:events(event_date, location, client_name)
         `)
         .gte('expense_date', format(dateRange.from, 'yyyy-MM-dd'))
         .lte('expense_date', format(dateRange.to, 'yyyy-MM-dd'));
 
       if (selectedStaffId !== 'all') {
         query = query.eq('staff_id', selectedStaffId);
       }
       if (selectedEventId !== 'all') {
         query = query.eq('event_id', selectedEventId);
       }
 
       const { data, error } = await query.order('expense_date', { ascending: false });
       if (error) throw error;
       setExpenses(data || []);
     } catch (error) {
       console.error('Error fetching expenses:', error);
     } finally {
       setIsLoading(false);
     }
   }, [selectedStaffId, selectedEventId, dateRange]);

   useEffect(() => {
     fetchExpenses();
   }, [fetchExpenses]);

   // Staff summary
   const staffSummary = useMemo(() => {
     const byStaff: Record<string, {
       staff: any;
       totalRaised: number;
       totalReimbursed: number;
       pending: number;
       approved: number;
       rejected: number;
       byEvent: Record<string, { event: any; amount: number }>;
     }> = {};
 
     expenses.forEach(exp => {
       const staffId = exp.staff_id;
       if (!byStaff[staffId]) {
         byStaff[staffId] = {
           staff: exp.staff,
           totalRaised: 0,
           totalReimbursed: 0,
           pending: 0,
           approved: 0,
           rejected: 0,
           byEvent: {},
         };
       }
 
       const amount = toAmount(exp.amount);
       byStaff[staffId].totalRaised += amount;
 
       if (exp.status === 'reimbursed') {
         byStaff[staffId].totalReimbursed += amount;
       } else if (exp.status === 'pending') {
         byStaff[staffId].pending += amount;
       } else if (exp.status === 'approved') {
         byStaff[staffId].approved += amount;
       } else if (exp.status === 'rejected') {
         byStaff[staffId].rejected += amount;
       }
 
       // Track by event
       if (exp.event_id) {
         const eventKey = exp.event_id;
         if (!byStaff[staffId].byEvent[eventKey]) {
           byStaff[staffId].byEvent[eventKey] = {
             event: exp.event,
             amount: 0,
           };
         }
         byStaff[staffId].byEvent[eventKey].amount += amount;
       }
     });
 
     return Object.values(byStaff).sort((a, b) => b.totalRaised - a.totalRaised);
   }, [expenses]);
 
   const totals = useMemo(() => {
     return staffSummary.reduce(
       (acc, s) => ({
         raised: acc.raised + s.totalRaised,
         reimbursed: acc.reimbursed + s.totalReimbursed,
         pending: acc.pending + s.pending,
         approved: acc.approved + s.approved,
       }),
       { raised: 0, reimbursed: 0, pending: 0, approved: 0 }
     );
   }, [staffSummary]);
 
   const getStatusBadge = (status: ExpenseStatus) => {
     switch (status) {
       case 'reimbursed':
         return <Badge variant="default" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />Reimbursed</Badge>;
       case 'approved':
         return <Badge variant="secondary" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
       case 'pending':
         return <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
       case 'rejected':
         return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
       default:
         return <Badge variant="outline" className="text-xs">{status}</Badge>;
     }
   };
 
   return (
     <div className="space-y-4">
       {/* Filters */}
       <Card>
         <CardContent className="pt-4">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             <div className="space-y-1">
               <Label className="text-xs">Staff</Label>
               <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                 <SelectTrigger>
                   <SelectValue placeholder="All Staff" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Staff</SelectItem>
                   {staff.map(s => (
                     <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
 
             <div className="space-y-1">
               <Label className="text-xs">Date Range</Label>
               <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="last7">Last 7 days</SelectItem>
                   <SelectItem value="last30">Last 30 days</SelectItem>
                   <SelectItem value="thisMonth">This month</SelectItem>
                   <SelectItem value="custom">Custom</SelectItem>
                 </SelectContent>
               </Select>
             </div>
 
             {datePreset === 'custom' && (
               <>
                 <div className="space-y-1">
                   <Label className="text-xs">From</Label>
                   <Popover>
                     <PopoverTrigger asChild>
                       <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                         <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                         {format(dateRange.from, 'dd MMM yy')}
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0">
                       <Calendar
                         mode="single"
                         selected={dateRange.from}
                         onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                         className="p-3 pointer-events-auto"
                       />
                     </PopoverContent>
                   </Popover>
                 </div>
                 <div className="space-y-1">
                   <Label className="text-xs">To</Label>
                   <Popover>
                     <PopoverTrigger asChild>
                       <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                         <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                         {format(dateRange.to, 'dd MMM yy')}
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0">
                       <Calendar
                         mode="single"
                         selected={dateRange.to}
                         onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                         className="p-3 pointer-events-auto"
                       />
                     </PopoverContent>
                   </Popover>
                 </div>
               </>
             )}
 
             <div className="space-y-1">
               <Label className="text-xs">Event (Optional)</Label>
               <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                 <SelectTrigger>
                   <SelectValue placeholder="All Events" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Events</SelectItem>
                   {events.map(e => (
                     <SelectItem key={e.id} value={e.id}>
                       {format(new Date(e.event_date), 'dd MMM')} - {e.location}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
           </div>
         </CardContent>
       </Card>
 
       {/* Summary Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Total Raised</p>
             <p className="text-xl font-bold"><Amount value={totals.raised} className="text-foreground" /></p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Total Reimbursed</p>
             <p className="text-xl font-bold"><Amount value={totals.reimbursed} className="text-success" /></p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Pending Approval</p>
             <p className="text-xl font-bold"><Amount value={totals.pending} className="text-warning" /></p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Awaiting Payout</p>
             <p className="text-xl font-bold"><Amount value={totals.approved} className="text-foreground" /></p>
           </CardHeader>
         </Card>
       </div>
 
       {/* Staff Summary Table */}
       <Card>
         <CardHeader>
           <CardTitle className="text-base">Staff-Wise Summary</CardTitle>
         </CardHeader>
         <CardContent>
           {isLoading ? (
             <div className="flex justify-center py-8">
               <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
             </div>
           ) : (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Staff</TableHead>
                   <TableHead className="text-right">Total Raised</TableHead>
                   <TableHead className="text-right">Reimbursed</TableHead>
                   <TableHead className="text-right">Pending</TableHead>
                   <TableHead className="text-right">Approved</TableHead>
                   <TableHead>Event Distribution</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {staffSummary.map((item, idx) => (
                   <TableRow key={idx}>
                     <TableCell>
                       <div>
                         <p className="font-medium">{item.staff?.full_name}</p>
                         <p className="text-xs text-muted-foreground">{item.staff?.employee_id}</p>
                       </div>
                     </TableCell>
                     <TableCell className="text-right"><Amount value={item.totalRaised} /></TableCell>
                     <TableCell className="text-right"><Amount value={item.totalReimbursed} className="text-success" /></TableCell>
                     <TableCell className="text-right"><Amount value={item.pending} className="text-warning" /></TableCell>
                     <TableCell className="text-right"><Amount value={item.approved} /></TableCell>
                     <TableCell className="text-xs">
                       {Object.values(item.byEvent).slice(0, 2).map((e, i) => (
                         <div key={i}>
                           {e.event ? `${format(new Date(e.event.event_date), 'dd MMM')} - ${e.event.location}` : 'No Event'}: 
                           <Amount value={e.amount} size="sm" />
                         </div>
                       ))}
                       {Object.keys(item.byEvent).length > 2 && (
                         <span className="text-muted-foreground">+{Object.keys(item.byEvent).length - 2} more</span>
                       )}
                     </TableCell>
                   </TableRow>
                 ))}
                 {staffSummary.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                       No expenses found for the selected filters
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
               {staffSummary.length > 0 && (
                 <TableFooter>
                   <TableRow>
                     <TableCell className="font-bold">Total</TableCell>
                     <TableCell className="text-right font-bold"><Amount value={totals.raised} /></TableCell>
                     <TableCell className="text-right font-bold"><Amount value={totals.reimbursed} /></TableCell>
                     <TableCell className="text-right font-bold"><Amount value={totals.pending} /></TableCell>
                     <TableCell className="text-right font-bold"><Amount value={totals.approved} /></TableCell>
                     <TableCell />
                   </TableRow>
                 </TableFooter>
               )}
             </Table>
           )}
         </CardContent>
       </Card>
 
       {/* Detailed Transactions */}
       <Card>
         <CardHeader>
           <CardTitle className="text-base">Recent Transactions</CardTitle>
         </CardHeader>
         <CardContent>
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Date</TableHead>
                 <TableHead>Staff</TableHead>
                 <TableHead>Category</TableHead>
                 <TableHead>Event</TableHead>
                 <TableHead className="text-right">Amount</TableHead>
                 <TableHead>Status</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {expenses.slice(0, 20).map(exp => (
                 <TableRow key={exp.id}>
                   <TableCell>{format(new Date(exp.expense_date), 'dd MMM yyyy')}</TableCell>
                   <TableCell>{exp.staff?.full_name}</TableCell>
                   <TableCell>{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory] || exp.category}</TableCell>
                   <TableCell className="text-xs">
                     {exp.event ? `${format(new Date(exp.event.event_date), 'dd MMM')} - ${exp.event.location}` : '-'}
                   </TableCell>
                   <TableCell className="text-right"><Amount value={exp.amount} /></TableCell>
                   <TableCell>{getStatusBadge(exp.status)}</TableCell>
                 </TableRow>
               ))}
             </TableBody>
           </Table>
           {expenses.length > 20 && (
             <p className="text-center text-sm text-muted-foreground mt-4">
               Showing 20 of {expenses.length} transactions
             </p>
           )}
         </CardContent>
       </Card>
     </div>
   );
 }