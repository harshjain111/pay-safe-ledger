 import { useState, useEffect, useMemo } from 'react';
 import { supabase } from '@/integrations/supabase/client';
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
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
   TableFooter,
 } from '@/components/ui/table';
 import { CalendarIcon } from 'lucide-react';
 import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
 import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types/database';
 
 interface Event {
   id: string;
   event_date: string;
   location: string;
   client_name: string | null;
 }
 
 interface Staff {
   id: string;
   full_name: string;
 }
 
 interface DateRange {
   from: Date;
   to: Date;
 }
 
 type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'custom';
 
 export function EventWiseExpenseReport() {
   const [events, setEvents] = useState<Event[]>([]);
   const [staff, setStaff] = useState<Staff[]>([]);
   const [selectedEventId, setSelectedEventId] = useState<string>('all');
   const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
   const [selectedCategory, setSelectedCategory] = useState<string>('all');
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
     // Update date range based on preset
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
 
   useEffect(() => {
     fetchExpenses();
   }, [selectedEventId, selectedStaffId, selectedCategory, dateRange]);
 
   const fetchFiltersData = async () => {
     const [eventsRes, staffRes] = await Promise.all([
       supabase.from('events').select('id, event_date, location, client_name').order('event_date', { ascending: false }),
       supabase.from('staff_public').select('id, full_name').order('full_name'),
     ]);
     setEvents(eventsRes.data || []);
     setStaff((staffRes.data || []) as Staff[]);
   };
 
   const fetchExpenses = async () => {
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
           staff:staff_public(full_name),
           event:events(event_date, location, client_name)
         `)
         .in('status', ['approved', 'reimbursed'])
         .gte('expense_date', format(dateRange.from, 'yyyy-MM-dd'))
         .lte('expense_date', format(dateRange.to, 'yyyy-MM-dd'));
 
       if (selectedEventId !== 'all') {
         query = query.eq('event_id', selectedEventId);
       }
       if (selectedStaffId !== 'all') {
         query = query.eq('staff_id', selectedStaffId);
       }
       if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory as ExpenseCategory);
       }
 
       const { data, error } = await query.order('expense_date', { ascending: false });
       if (error) throw error;
       setExpenses(data || []);
     } catch (error) {
       console.error('Error fetching expenses:', error);
     } finally {
       setIsLoading(false);
     }
   };
 
   // Aggregated data by event
   const eventSummary = useMemo(() => {
     const byEvent: Record<string, { event: any; total: number; byCategory: Record<string, number>; byStaff: Record<string, { name: string; amount: number }> }> = {};
     
     expenses.forEach(exp => {
       const eventKey = exp.event_id || 'no_event';
       if (!byEvent[eventKey]) {
         byEvent[eventKey] = {
           event: exp.event || null,
           total: 0,
           byCategory: {},
           byStaff: {},
         };
       }
       byEvent[eventKey].total += Number(exp.amount);
       const category = exp.category as ExpenseCategory;
       byEvent[eventKey].byCategory[category] = (byEvent[eventKey].byCategory[category] || 0) + Number(exp.amount);
       
       const staffId = exp.staff_id;
       if (!byEvent[eventKey].byStaff[staffId]) {
         byEvent[eventKey].byStaff[staffId] = { name: exp.staff?.full_name || 'Unknown', amount: 0 };
       }
       byEvent[eventKey].byStaff[staffId].amount += Number(exp.amount);
     });
 
     return Object.entries(byEvent).map(([key, val]) => ({
       eventId: key,
       eventLabel: val.event ? `${format(new Date(val.event.event_date), 'dd MMM yyyy')} - ${val.event.location}${val.event.client_name ? ` (${val.event.client_name})` : ''}` : 'No Event',
       ...val,
     })).sort((a, b) => b.total - a.total);
   }, [expenses]);
 
   // Category breakdown
   const categoryBreakdown = useMemo(() => {
     const byCategory: Record<string, number> = {};
     expenses.forEach(exp => {
       byCategory[exp.category] = (byCategory[exp.category] || 0) + Number(exp.amount);
     });
     return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
   }, [expenses]);
 
   // Staff breakdown
   const staffBreakdown = useMemo(() => {
     const byStaff: Record<string, { name: string; amount: number }> = {};
     expenses.forEach(exp => {
       const staffId = exp.staff_id;
       if (!byStaff[staffId]) {
         byStaff[staffId] = { name: exp.staff?.full_name || 'Unknown', amount: 0 };
       }
       byStaff[staffId].amount += Number(exp.amount);
     });
     return Object.values(byStaff).sort((a, b) => b.amount - a.amount);
   }, [expenses]);
 
   const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
 
   const categories = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
 
   return (
     <div className="space-y-4">
       {/* Filters */}
       <Card>
         <CardContent className="pt-4">
           <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
             <div className="space-y-1">
               <Label className="text-xs">Event</Label>
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
               <Label className="text-xs">Category</Label>
               <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                 <SelectTrigger>
                   <SelectValue placeholder="All Categories" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Categories</SelectItem>
                   {categories.map(cat => (
                     <SelectItem key={cat} value={cat}>{EXPENSE_CATEGORY_LABELS[cat]}</SelectItem>
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
             <p className="text-xs text-muted-foreground">Total Expenses</p>
             <p className="text-xl font-bold"><Amount value={totalExpense} className="text-foreground" /></p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Events</p>
             <p className="text-xl font-bold">{eventSummary.filter(e => e.eventId !== 'no_event').length}</p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Categories</p>
             <p className="text-xl font-bold">{categoryBreakdown.length}</p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Staff Contributing</p>
             <p className="text-xl font-bold">{staffBreakdown.length}</p>
           </CardHeader>
         </Card>
       </div>
 
       {/* Event-wise breakdown */}
       <Card>
         <CardHeader>
           <CardTitle className="text-base">Event-Wise Breakdown</CardTitle>
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
                   <TableHead>Event</TableHead>
                   <TableHead className="text-right">Total</TableHead>
                   <TableHead>Top Categories</TableHead>
                   <TableHead>Top Contributors</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {eventSummary.map(item => (
                   <TableRow key={item.eventId}>
                     <TableCell className="font-medium">{item.eventLabel}</TableCell>
                     <TableCell className="text-right">
                       <Amount value={item.total} />
                     </TableCell>
                     <TableCell className="text-xs">
                       {Object.entries(item.byCategory).slice(0, 2).map(([cat, amt]) => (
                         <div key={cat}>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat}: <Amount value={amt} size="sm" /></div>
                       ))}
                     </TableCell>
                     <TableCell className="text-xs">
                       {Object.values(item.byStaff).slice(0, 2).map((s, i) => (
                         <div key={i}>{s.name}: <Amount value={s.amount} size="sm" /></div>
                       ))}
                     </TableCell>
                   </TableRow>
                 ))}
                 {eventSummary.length === 0 && (
                   <TableRow>
                     <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                       No expenses found for the selected filters
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
               {eventSummary.length > 0 && (
                 <TableFooter>
                   <TableRow>
                     <TableCell className="font-bold">Total</TableCell>
                     <TableCell className="text-right font-bold">
                       <Amount value={totalExpense} />
                     </TableCell>
                     <TableCell colSpan={2} />
                   </TableRow>
                 </TableFooter>
               )}
             </Table>
           )}
         </CardContent>
       </Card>
 
       {/* Side-by-side breakdowns */}
       <div className="grid md:grid-cols-2 gap-4">
         {/* Category Breakdown */}
         <Card>
           <CardHeader>
             <CardTitle className="text-base">Category Breakdown</CardTitle>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Category</TableHead>
                   <TableHead className="text-right">Amount</TableHead>
                   <TableHead className="text-right">%</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {categoryBreakdown.map(([cat, amt]) => (
                   <TableRow key={cat}>
                     <TableCell>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat}</TableCell>
                     <TableCell className="text-right"><Amount value={amt} /></TableCell>
                     <TableCell className="text-right text-muted-foreground">
                       {totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : 0}%
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
 
         {/* Staff Breakdown */}
         <Card>
           <CardHeader>
             <CardTitle className="text-base">Staff Contribution</CardTitle>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Staff</TableHead>
                   <TableHead className="text-right">Amount</TableHead>
                   <TableHead className="text-right">%</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {staffBreakdown.map((item, idx) => (
                   <TableRow key={idx}>
                     <TableCell>{item.name}</TableCell>
                     <TableCell className="text-right"><Amount value={item.amount} /></TableCell>
                     <TableCell className="text-right text-muted-foreground">
                       {totalExpense > 0 ? ((item.amount / totalExpense) * 100).toFixed(1) : 0}%
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }