import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, RefreshCw, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface LogRow {
  id: string;
  staff_id: string | null;
  staff_phone: string;
  event_type: string;
  slab: string;
  template_name: string;
  deduction_amount: number;
  sent_at: string;
  success: boolean;
  error_message: string | null;
  meta_message_id: string | null;
}

interface StaffMini {
  id: string;
  full_name: string;
}

const slabLabel: Record<string, string> = {
  on_time: 'On Time',
  level_1: 'Level 1',
  level_2: 'Level 2',
  half_day: 'Half Day',
  full_day: 'Full Day',
};

const slabBadge: Record<string, string> = {
  on_time: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  level_1: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  level_2: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  half_day: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  full_day: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export default function WhatsAppLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [allStaff, setAllStaff] = useState<StaffMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Filters
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [staffId, setStaffId] = useState<string>('all');
  const [event, setEvent] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  async function load() {
    setLoading(true);
    let q = supabase
      .from('whatsapp_notification_log' as never)
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(500);
    if (from) q = q.gte('sent_at', from.toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      q = q.lte('sent_at', end.toISOString());
    }
    if (staffId !== 'all') q = q.eq('staff_id', staffId);
    if (event !== 'all') q = q.eq('event_type', event);
    if (status !== 'all') q = q.eq('success', status === 'sent');

    const { data, error } = await q;
    if (error) {
      toast.error('Failed to load logs');
      setLoading(false);
      return;
    }
    setLogs((data as LogRow[]) ?? []);
    setLoading(false);
  }

  async function loadStaff() {
    const { data } = await supabase.from('staff').select('id, full_name').order('full_name');
    const list = (data as StaffMini[]) ?? [];
    setAllStaff(list);
    setStaffMap(Object.fromEntries(list.map((s) => [s.id, s.full_name])));
  }

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    load();
  }, [from, to, staffId, event, status]);

  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const monthKey = new Date().toISOString().slice(0, 7);
    const sentToday = logs.filter(
      (l) => l.success && new Date(l.sent_at).toDateString() === todayStr,
    ).length;
    const failedToday = logs.filter(
      (l) => !l.success && new Date(l.sent_at).toDateString() === todayStr,
    ).length;
    const monthDeductions = logs
      .filter((l) => l.sent_at.startsWith(monthKey) && l.success)
      .reduce((s, l) => s + Number(l.deduction_amount || 0), 0);
    return { sentToday, failedToday, monthDeductions };
  }, [logs]);

  async function retry(row: LogRow) {
    setRetrying(row.id);
    try {
      const staffName = (row.staff_id && staffMap[row.staff_id]) || 'Staff';
      const { data, error } = await supabase.functions.invoke('send-attendance-whatsapp', {
        body: {
          staff_name: staffName,
          staff_phone: row.staff_phone,
          staff_id: row.staff_id,
          event_type: row.event_type,
          actual_time: row.sent_at,
          scheduled_time: row.sent_at,
          slab: row.slab,
          deduction_amount: Number(row.deduction_amount || 0),
        },
      });
      if (error || (data && data.success === false)) {
        toast.error(`Retry failed: ${(data && data.error) || error?.message || 'Unknown error'}`);
      } else {
        toast.success('Retry sent successfully');
        load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  function clearFilters() {
    setFrom(undefined);
    setTo(undefined);
    setStaffId('all');
    setEvent('all');
    setStatus('all');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Notifications"
        description="Track every attendance WhatsApp message sent to staff."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {stats.sentToday}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              {stats.failedToday}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deductions Notified This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{stats.monthDeductions.toLocaleString('en-IN')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start', !from && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {from ? format(from, 'dd MMM yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={from} onSelect={setFrom} className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start', !to && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {to ? format(to, 'dd MMM yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={to} onSelect={setTo} className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {allStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={event} onValueChange={setEvent}>
            <SelectTrigger><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="checkin">Check-in</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={clearFilters}>Clear</Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Slab</TableHead>
                  <TableHead className="text-right">Deduction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      No notifications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(row.sent_at), 'dd MMM yyyy, h:mm a')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {(row.staff_id && staffMap[row.staff_id]) || (
                          <span className="text-muted-foreground">{row.staff_phone}</span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">
                        {row.event_type === 'checkin' ? 'Check-in' : 'Checkout'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn('border-0', slabBadge[row.slab])}>
                          {slabLabel[row.slab] ?? row.slab}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(row.deduction_amount) > 0
                          ? `₹${Number(row.deduction_amount).toLocaleString('en-IN')}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {row.success ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                            Sent
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-0">
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={row.error_message ?? row.meta_message_id ?? ''}>
                        {row.success ? row.meta_message_id ?? '—' : row.error_message ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {!row.success && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retrying === row.id}
                            onClick={() => retry(row)}
                          >
                            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', retrying === row.id && 'animate-spin')} />
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
