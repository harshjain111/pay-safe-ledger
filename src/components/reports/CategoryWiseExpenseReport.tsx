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
 import { Progress } from '@/components/ui/progress';
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
 
 interface DateRange {
   from: Date;
   to: Date;
 }
 
 type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'custom';
 
 export function CategoryWiseExpenseReport() {
   const [events, setEvents] = useState<Event[]>([]);
   const [selectedCategory, setSelectedCategory] = useState<string>('all');
   const [selectedEventId, setSelectedEventId] = useState<string>('all');
   const [datePreset, setDatePreset] = useState<DatePreset>('last30');
   const [dateRange, setDateRange] = useState<DateRange>({
     from: subDays(new Date(), 30),
     to: new Date(),
   });
   const [expenses, setExpenses] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(false);
 
   useEffect(() => {
     fetchEvents();
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
 
   const fetchEvents = async () => {
     const { data } = await supabase
       .from('events')
       .select('id, event_date, location, client_name')
       .order('event_date', { ascending: false });
     setEvents(data || []);
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
           staff:staff_public(full_name),
           event:events(event_date, location, client_name)
         `)
         .in('status', ['approved', 'reimbursed'])
         .gte('expense_date', format(dateRange.from, 'yyyy-MM-dd'))
         .lte('expense_date', format(dateRange.to, 'yyyy-MM-dd'));
 
       if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory as ExpenseCategory);
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
   }, [selectedCategory, selectedEventId, dateRange]);

   useEffect(() => {
     fetchExpenses();
   }, [fetchExpenses]);

   // Aggregated data by category
   const categorySummary = useMemo(() => {
     const byCategory: Record<string, { total: number; count: number; details: any[] }> = {};
     
     expenses.forEach(exp => {
       const cat = exp.category as string;
       if (!byCategory[cat]) {
         byCategory[cat] = { total: 0, count: 0, details: [] };
       }
       byCategory[cat].total += toAmount(exp.amount);
       byCategory[cat].count += 1;
       byCategory[cat].details.push(exp);
     });
 
     return Object.entries(byCategory)
       .map(([category, data]) => ({
         category: category as ExpenseCategory,
         label: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] || category,
         ...data,
       }))
       .sort((a, b) => b.total - a.total);
   }, [expenses]);
 
   const totalExpense = expenses.reduce((sum, e) => sum + toAmount(e.amount), 0);
   const categories = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
 
   return (
     <div className="space-y-4">
       {/* Filters */}
       <Card>
         <CardContent className="pt-4">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
       <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Total Spend</p>
             <p className="text-xl font-bold"><Amount value={totalExpense} className="text-foreground" /></p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Categories Used</p>
             <p className="text-xl font-bold">{categorySummary.length}</p>
           </CardHeader>
         </Card>
         <Card>
           <CardHeader className="pb-2 p-3">
             <p className="text-xs text-muted-foreground">Total Transactions</p>
             <p className="text-xl font-bold">{expenses.length}</p>
           </CardHeader>
         </Card>
       </div>
 
       {/* Category Distribution with Progress Bars */}
       <Card>
         <CardHeader>
           <CardTitle className="text-base">Spend by Category</CardTitle>
         </CardHeader>
         <CardContent>
           {isLoading ? (
             <div className="flex justify-center py-8">
               <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
             </div>
           ) : (
             <div className="space-y-4">
               {categorySummary.map(item => {
                 const percentage = totalExpense > 0 ? (item.total / totalExpense) * 100 : 0;
                 return (
                   <div key={item.category} className="space-y-1">
                     <div className="flex justify-between text-sm">
                       <span className="font-medium">{item.label}</span>
                       <span className="text-muted-foreground">
                         <Amount value={item.total} size="sm" /> ({percentage.toFixed(1)}%)
                       </span>
                     </div>
                     <Progress value={percentage} className="h-2" />
                     <p className="text-xs text-muted-foreground">{item.count} transactions</p>
                   </div>
                 );
               })}
               {categorySummary.length === 0 && (
                 <p className="text-center py-8 text-muted-foreground">No expenses found</p>
               )}
             </div>
           )}
         </CardContent>
       </Card>
 
       {/* Detailed Table */}
       <Card>
         <CardHeader>
           <CardTitle className="text-base">Category Details</CardTitle>
         </CardHeader>
         <CardContent>
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Category</TableHead>
                 <TableHead className="text-right">Amount</TableHead>
                 <TableHead className="text-right">Count</TableHead>
                 <TableHead className="text-right">Avg per Transaction</TableHead>
                 <TableHead className="text-right">% of Total</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {categorySummary.map(item => (
                 <TableRow key={item.category}>
                   <TableCell className="font-medium">{item.label}</TableCell>
                   <TableCell className="text-right"><Amount value={item.total} /></TableCell>
                   <TableCell className="text-right">{item.count}</TableCell>
                   <TableCell className="text-right">
                     <Amount value={item.count > 0 ? item.total / item.count : 0} />
                   </TableCell>
                   <TableCell className="text-right text-muted-foreground">
                     {totalExpense > 0 ? ((item.total / totalExpense) * 100).toFixed(1) : 0}%
                   </TableCell>
                 </TableRow>
               ))}
             </TableBody>
             {categorySummary.length > 0 && (
               <TableFooter>
                 <TableRow>
                   <TableCell className="font-bold">Total</TableCell>
                   <TableCell className="text-right font-bold"><Amount value={totalExpense} /></TableCell>
                   <TableCell className="text-right font-bold">{expenses.length}</TableCell>
                   <TableCell className="text-right font-bold">
                     <Amount value={expenses.length > 0 ? totalExpense / expenses.length : 0} />
                   </TableCell>
                   <TableCell className="text-right font-bold">100%</TableCell>
                 </TableRow>
               </TableFooter>
             )}
           </Table>
         </CardContent>
       </Card>
     </div>
   );
 }