import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, CheckCircle, Clock, XCircle, Eye, List, BarChart3, Users, Tag, Calendar as CalendarIconSolid } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, type ExpenseCategory, type ExpenseStatus } from '@/types/database';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DateRange { from: Date; to: Date; }
type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'last3Months' | 'custom';
type ViewMode = 'list' | 'by_category' | 'by_staff' | 'by_event';

const COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const STATUS_OPTIONS: ExpenseStatus[] = ['draft', 'pending', 'approved', 'rejected', 'reimbursed'];

export function ExpenseExplorer() {
  const [events, setEvents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('last30');
  const [dateRange, setDateRange] = useState<DateRange>({ from: subDays(new Date(), 30), to: new Date() });
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  useEffect(() => { fetchFiltersData(); }, []);

  useEffect(() => {
    const now = new Date();
    switch (datePreset) {
      case 'last7': setDateRange({ from: subDays(now, 7), to: now }); break;
      case 'last30': setDateRange({ from: subDays(now, 30), to: now }); break;
      case 'thisMonth': setDateRange({ from: startOfMonth(now), to: endOfMonth(now) }); break;
      case 'last3Months': setDateRange({ from: subDays(now, 90), to: now }); break;
    }
  }, [datePreset]);

  useEffect(() => { fetchExpenses(); }, [selectedStaffId, selectedEventId, selectedCategory, selectedStatus, dateRange]);

  const fetchFiltersData = async () => {
    const [eventsRes, staffRes] = await Promise.all([
      supabase.from('events').select('id, event_date, location, client_name').order('event_date', { ascending: false }),
      supabase.from('staff_public').select('id, full_name, employee_id').order('full_name'),
    ]);
    setEvents(eventsRes.data || []);
    setStaff(staffRes.data || []);
  };

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select(`
          id, amount, category, description, expense_date, status, event_id, staff_id,
          approved_by_user_name, approved_at, reimbursed_at, reimbursed_by_user_name, proof_url, rejection_reason,
          staff:staff_public(full_name, employee_id),
          event:events(event_date, location, client_name)
        `)
        .gte('expense_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('expense_date', format(dateRange.to, 'yyyy-MM-dd'));

      if (selectedStatus !== 'all') query = query.eq('status', selectedStatus as 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed');
      else query = query.in('status', ['pending', 'approved', 'reimbursed', 'rejected']);
      if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);
      if (selectedEventId !== 'all') query = query.eq('event_id', selectedEventId);
      if (selectedCategory !== 'all') query = query.eq('category', selectedCategory as ExpenseCategory);

      const { data, error } = await query.order('expense_date', { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totals = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const reimbursed = expenses.filter(e => e.status === 'reimbursed').reduce((s, e) => s + Number(e.amount), 0);
    const pending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
    const approved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
    return { total, reimbursed, pending, approved, count: expenses.length };
  }, [expenses]);

  const categoryData = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    expenses.forEach(e => {
      const cat = e.category as string;
      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += Number(e.amount);
      map[cat].count++;
    });
    return Object.entries(map).map(([k, v]) => ({
      name: EXPENSE_CATEGORY_LABELS[k as ExpenseCategory] || k,
      category: k,
      value: v.total,
      count: v.count,
    })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const staffData = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number; reimbursed: number; pending: number }> = {};
    expenses.forEach(e => {
      const sid = e.staff_id;
      if (!map[sid]) map[sid] = { name: e.staff?.full_name || 'Unknown', total: 0, count: 0, reimbursed: 0, pending: 0 };
      map[sid].total += Number(e.amount);
      map[sid].count++;
      if (e.status === 'reimbursed') map[sid].reimbursed += Number(e.amount);
      if (e.status === 'pending') map[sid].pending += Number(e.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const eventData = useMemo(() => {
    const map: Record<string, { label: string; total: number; count: number }> = {};
    expenses.forEach(e => {
      const eid = e.event_id || 'no_event';
      if (!map[eid]) {
        map[eid] = {
          label: e.event ? `${format(new Date(e.event.event_date), 'dd MMM')} - ${e.event.location}` : 'No Event',
          total: 0, count: 0,
        };
      }
      map[eid].total += Number(e.amount);
      map[eid].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const getStatusBadge = (status: ExpenseStatus) => {
    const variants: Record<string, any> = {
      reimbursed: { v: 'default', icon: CheckCircle, label: 'Reimbursed' },
      approved: { v: 'secondary', icon: CheckCircle, label: 'Approved' },
      pending: { v: 'outline', icon: Clock, label: 'Pending' },
      rejected: { v: 'destructive', icon: XCircle, label: 'Rejected' },
      draft: { v: 'outline', icon: Clock, label: 'Draft' },
    };
    const s = variants[status] || variants.draft;
    const Icon = s.icon;
    return <Badge variant={s.v} className="text-xs"><Icon className="h-3 w-3 mr-1" />{s.label}</Badge>;
  };

  const categories = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Staff</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger><SelectValue placeholder="All Staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{EXPENSE_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Event</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
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
              <Label className="text-xs">Period</Label>
              <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7">Last 7 days</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="thisMonth">This month</SelectItem>
                  <SelectItem value="last3Months">Last 3 months</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {datePreset === 'custom' && (
              <div className="space-y-1 col-span-2 md:col-span-1 flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal text-xs">
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {format(dateRange.from, 'dd MMM')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateRange.from} onSelect={d => d && setDateRange(p => ({ ...p, from: d }))} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal text-xs">
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {format(dateRange.to, 'dd MMM')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateRange.to} onSelect={d => d && setDateRange(p => ({ ...p, to: d }))} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold"><Amount value={totals.total} className="text-foreground" /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Reimbursed</p><p className="text-lg font-bold text-emerald-600"><Amount value={totals.reimbursed} /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-bold text-amber-600"><Amount value={totals.pending} /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Approved</p><p className="text-lg font-bold"><Amount value={totals.approved} /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Count</p><p className="text-lg font-bold">{totals.count}</p></CardHeader></Card>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="list" className="text-xs"><List className="h-3.5 w-3.5 mr-1" />All</TabsTrigger>
          <TabsTrigger value="by_category" className="text-xs"><Tag className="h-3.5 w-3.5 mr-1" />Category</TabsTrigger>
          <TabsTrigger value="by_staff" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" />Staff</TabsTrigger>
          <TabsTrigger value="by_event" className="text-xs"><CalendarIconSolid className="h-3.5 w-3.5 mr-1" />Event</TabsTrigger>
        </TabsList>

        {/* LIST VIEW */}
        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(exp => (
                      <TableRow key={exp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedExpense(exp)}>
                        <TableCell className="text-xs">{format(new Date(exp.expense_date), 'dd MMM yy')}</TableCell>
                        <TableCell className="text-sm">{exp.staff?.full_name}</TableCell>
                        <TableCell className="text-xs">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{exp.description}</TableCell>
                        <TableCell className="text-xs">{exp.event ? `${format(new Date(exp.event.event_date), 'dd MMM')} - ${exp.event.location}` : '-'}</TableCell>
                        <TableCell className="text-right"><Amount value={exp.amount} /></TableCell>
                        <TableCell>{getStatusBadge(exp.status)}</TableCell>
                        <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))}
                    {expenses.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
                    )}
                  </TableBody>
                  {expenses.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5} className="font-bold">Total ({expenses.length} expenses)</TableCell>
                        <TableCell className="text-right font-bold"><Amount value={totals.total} /></TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CATEGORY VIEW */}
        <TabsContent value="by_category" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Category Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {categoryData.map((item, i) => {
                  const pct = totals.total > 0 ? (item.value / totals.total) * 100 : 0;
                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground"><Amount value={item.value} size="sm" /> ({pct.toFixed(1)}%)</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-xs text-muted-foreground">{item.count} transactions</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* STAFF VIEW */}
        <TabsContent value="by_staff" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Staff-wise Spend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={staffData.slice(0, 10)} layout="vertical">
                    <XAxis type="number" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Staff Summary</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Reimbursed</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffData.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{s.name}</TableCell>
                        <TableCell className="text-right"><Amount value={s.total} /></TableCell>
                        <TableCell className="text-right text-emerald-600"><Amount value={s.reimbursed} /></TableCell>
                        <TableCell className="text-right text-amber-600"><Amount value={s.pending} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EVENT VIEW */}
        <TabsContent value="by_event" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Event-Wise Expenses</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Avg / Transaction</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventData.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{e.label}</TableCell>
                      <TableCell className="text-right"><Amount value={e.total} /></TableCell>
                      <TableCell className="text-right">{e.count}</TableCell>
                      <TableCell className="text-right"><Amount value={e.count > 0 ? e.total / e.count : 0} /></TableCell>
                      <TableCell className="text-right text-muted-foreground">{totals.total > 0 ? ((e.total / totals.total) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {eventData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold"><Amount value={totals.total} /></TableCell>
                      <TableCell className="text-right font-bold">{totals.count}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expense Detail Dialog */}
      <Dialog open={!!selectedExpense} onOpenChange={() => setSelectedExpense(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="text-lg font-bold"><Amount value={selectedExpense.amount} /></p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1">{getStatusBadge(selectedExpense.status)}</div></div>
                <div><p className="text-xs text-muted-foreground">Date</p><p className="text-sm">{format(new Date(selectedExpense.expense_date), 'dd MMM yyyy')}</p></div>
                <div><p className="text-xs text-muted-foreground">Category</p><p className="text-sm">{EXPENSE_CATEGORY_LABELS[selectedExpense.category as ExpenseCategory]}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Staff</p><p className="text-sm">{selectedExpense.staff?.full_name} ({selectedExpense.staff?.employee_id})</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="text-sm">{selectedExpense.description}</p></div>
                {selectedExpense.event && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Event</p><p className="text-sm">{format(new Date(selectedExpense.event.event_date), 'dd MMM yyyy')} - {selectedExpense.event.location}{selectedExpense.event.client_name ? ` (${selectedExpense.event.client_name})` : ''}</p></div>
                )}
                {selectedExpense.approved_by_user_name && (
                  <div><p className="text-xs text-muted-foreground">Approved By</p><p className="text-sm">{selectedExpense.approved_by_user_name}</p>{selectedExpense.approved_at && <p className="text-xs text-muted-foreground">{format(new Date(selectedExpense.approved_at), 'dd MMM yy, hh:mm a')}</p>}</div>
                )}
                {selectedExpense.reimbursed_by_user_name && (
                  <div><p className="text-xs text-muted-foreground">Reimbursed By</p><p className="text-sm">{selectedExpense.reimbursed_by_user_name}</p>{selectedExpense.reimbursed_at && <p className="text-xs text-muted-foreground">{format(new Date(selectedExpense.reimbursed_at), 'dd MMM yy, hh:mm a')}</p>}</div>
                )}
                {selectedExpense.rejection_reason && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Rejection Reason</p><p className="text-sm text-destructive">{selectedExpense.rejection_reason}</p></div>
                )}
              </div>
              {selectedExpense.proof_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Receipt/Proof</p>
                  <a href={selectedExpense.proof_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">View Attachment</a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
