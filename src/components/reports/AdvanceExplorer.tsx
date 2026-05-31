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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { CalendarIcon, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DateRange { from: Date; to: Date; }
type DatePreset = 'last30' | 'last3Months' | 'last6Months' | 'thisMonth' | 'custom';

export function AdvanceExplorer() {
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('last3Months');
  const [dateRange, setDateRange] = useState<DateRange>({ from: subDays(new Date(), 90), to: new Date() });
  const [advances, setAdvances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  useEffect(() => { fetchStaff(); }, []);

  useEffect(() => {
    const now = new Date();
    switch (datePreset) {
      case 'last30': setDateRange({ from: subDays(now, 30), to: now }); break;
      case 'last3Months': setDateRange({ from: subMonths(now, 3), to: now }); break;
      case 'last6Months': setDateRange({ from: subMonths(now, 6), to: now }); break;
      case 'thisMonth': setDateRange({ from: startOfMonth(now), to: endOfMonth(now) }); break;
    }
  }, [datePreset]);

  useEffect(() => { fetchAdvances(); }, [selectedStaffId, dateRange]);

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff_public').select('id, full_name, employee_id').order('full_name');
    setStaff(data || []);
  };

  const fetchAdvances = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('payment_requests')
        .select(`
          id, amount, reason, status, payout_type, created_at, approved_at, paid_at,
          approved_by_user_name, paid_by_user_name, rejection_reason, staff_id,
          staff:staff_public(full_name, employee_id)
        `)
        .eq('payout_type', 'advance')
        .gte('created_at', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('created_at', format(dateRange.to, 'yyyy-MM-dd') + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (selectedStaffId !== 'all') query = query.eq('staff_id', selectedStaffId);

      const { data, error } = await query;
      if (error) throw error;
      setAdvances(data || []);
    } catch (error) {
      console.error('Error fetching advances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const staffSummary = useMemo(() => {
    const map: Record<string, { name: string; empId: string; total: number; paid: number; pending: number; items: any[] }> = {};
    // Only include approved (paid) and pending advances — exclude rejected
    advances.filter(a => a.status !== 'rejected').forEach(a => {
      const sid = a.staff_id;
      if (!map[sid]) map[sid] = { name: a.staff?.full_name || 'Unknown', empId: a.staff?.employee_id || '', total: 0, paid: 0, pending: 0, items: [] };
      const amt = Number(a.amount);
      map[sid].total += amt;
      if (a.status === 'approved') map[sid].paid += amt;
      if (a.status === 'pending') map[sid].pending += amt;
      map[sid].items.push(a);
    });
    return Object.entries(map).map(([id, v]) => ({ staffId: id, ...v })).sort((a, b) => b.total - a.total);
  }, [advances]);

  const activeAdvances = useMemo(() => advances.filter(a => a.status !== 'rejected'), [advances]);

  const totals = useMemo(() => ({
    total: activeAdvances.reduce((s, a) => s + Number(a.amount), 0),
    paid: activeAdvances.filter(a => a.status === 'approved').reduce((s, a) => s + Number(a.amount), 0),
    pending: activeAdvances.filter(a => a.status === 'pending').reduce((s, a) => s + Number(a.amount), 0),
    count: activeAdvances.length,
  }), [activeAdvances]);

  const chartData = staffSummary.slice(0, 8).map(s => ({ name: s.name.split(' ')[0], total: s.total, paid: s.paid, pending: s.pending }));

  const toggleExpand = (id: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    if (status === 'approved') return <Badge variant="default" className="text-xs">Paid</Badge>;
    if (status === 'pending') return <Badge variant="outline" className="text-xs">Pending</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
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
                <SelectTrigger><SelectValue placeholder="All Staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="thisMonth">This month</SelectItem>
                  <SelectItem value="last3Months">Last 3 months</SelectItem>
                  <SelectItem value="last6Months">Last 6 months</SelectItem>
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
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />{format(dateRange.from, 'dd MMM yy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.from} onSelect={d => d && setDateRange(p => ({ ...p, from: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />{format(dateRange.to, 'dd MMM yy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange.to} onSelect={d => d && setDateRange(p => ({ ...p, to: d }))} className="p-3 pointer-events-auto" /></PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Total Requested</p><p className="text-lg font-bold"><Amount value={totals.total} className="text-foreground" /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Paid Out</p><p className="text-lg font-bold text-emerald-600"><Amount value={totals.paid} /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-bold text-amber-600"><Amount value={totals.pending} /></p></CardHeader></Card>
        <Card><CardHeader className="pb-2 p-3"><p className="text-xs text-muted-foreground">Requests</p><p className="text-lg font-bold">{totals.count}</p></CardHeader></Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Staff-wise Advances</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="paid" fill="hsl(var(--primary))" stackId="a" radius={[0, 0, 0, 0]} name="Paid" />
                <Bar dataKey="pending" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Staff-wise expandable list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Advance Details by Staff</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : staffSummary.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No advance requests found</p>
          ) : (
            <div className="space-y-2">
              {staffSummary.map(s => (
                <Collapsible key={s.staffId} open={expandedStaff.has(s.staffId)}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(s.staffId)}>
                      <div className="flex items-center gap-2">
                        {expandedStaff.has(s.staffId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.empId} · {s.items.length} requests</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm"><Amount value={s.total} /></p>
                        {s.pending > 0 && <p className="text-xs text-amber-600">₹{s.pending.toLocaleString('en-IN')} pending</p>}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 mt-1 border-l-2 border-muted pl-4 space-y-1">
                      {s.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedAdvance(item)}>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm">{item.reason}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'dd MMM yy')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Amount value={item.amount} />
                            {getStatusBadge(item.status)}
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedAdvance} onOpenChange={() => setSelectedAdvance(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Advance Details</DialogTitle></DialogHeader>
          {selectedAdvance && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="text-lg font-bold"><Amount value={selectedAdvance.amount} /></p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1">{getStatusBadge(selectedAdvance.status)}</div></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Staff</p><p className="text-sm">{selectedAdvance.staff?.full_name} ({selectedAdvance.staff?.employee_id})</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm">{selectedAdvance.reason}</p></div>
                <div><p className="text-xs text-muted-foreground">Requested</p><p className="text-sm">{format(new Date(selectedAdvance.created_at), 'dd MMM yy, hh:mm a')}</p></div>
                {selectedAdvance.approved_by_user_name && (
                  <div><p className="text-xs text-muted-foreground">Approved By</p><p className="text-sm">{selectedAdvance.approved_by_user_name}</p>{selectedAdvance.approved_at && <p className="text-xs text-muted-foreground">{format(new Date(selectedAdvance.approved_at), 'dd MMM yy')}</p>}</div>
                )}
                {selectedAdvance.paid_by_user_name && (
                  <div><p className="text-xs text-muted-foreground">Paid By</p><p className="text-sm">{selectedAdvance.paid_by_user_name}</p>{selectedAdvance.paid_at && <p className="text-xs text-muted-foreground">{format(new Date(selectedAdvance.paid_at), 'dd MMM yy')}</p>}</div>
                )}
                {selectedAdvance.rejection_reason && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Rejection Reason</p><p className="text-sm text-destructive">{selectedAdvance.rejection_reason}</p></div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
