import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CalendarIcon, 
  Eye,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { AuditLog } from '@/types/database';

interface DateRange {
  from: Date;
  to: Date;
}

const MODULES = [
  { value: 'all', label: 'All Modules' },
  { value: 'ledger_entries', label: 'Ledger' },
  { value: 'salary_settlements', label: 'Settlements' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'payment_requests', label: 'Payment Requests' },
];

const ACTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'INSERT', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
];

export default function AuditLogPage() {
  const navigate = useNavigate();
  const { isOwner, isCA } = useAuth();
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('audit_log')
        .select('*')
        .gte('performed_at', dateRange.from.toISOString())
        .lte('performed_at', dateRange.to.toISOString())
        .order('performed_at', { ascending: false })
        .limit(500);

      if (selectedModule !== 'all') {
        query = query.eq('table_name', selectedModule);
      }

      if (selectedAction !== 'all') {
        query = query.eq('action', selectedAction);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data as AuditLog[] || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedModule, selectedAction, dateRange]);

  useEffect(() => {
    if (!isOwner && !isCA) {
      toast({
        title: 'Access Denied',
        description: 'Only owners and CA can view audit logs.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }
    fetchLogs();
  }, [isOwner, isCA, navigate, fetchLogs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-success/20 text-success border-success/30">Created</Badge>;
      case 'UPDATE':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Updated</Badge>;
      case 'DELETE':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Deleted</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const getModuleLabel = (tableName: string) => {
    switch (tableName) {
      case 'ledger_entries':
        return 'Ledger';
      case 'salary_settlements':
        return 'Settlement';
      case 'expenses':
        return 'Expense';
      case 'payment_requests':
        return 'Request';
      default:
        return tableName;
    }
  };

  const formatChanges = (log: AuditLog) => {
    if (log.action === 'INSERT') {
      return 'New record created';
    }
    if (log.action === 'DELETE') {
      return 'Record deleted';
    }
    
    // For updates, show what changed
    const oldData = log.old_data as Record<string, unknown> || {};
    const newData = log.new_data as Record<string, unknown> || {};
    const changes: string[] = [];
    
    Object.keys(newData).forEach(key => {
      if (oldData[key] !== newData[key] && key !== 'updated_at') {
        changes.push(key.replace(/_/g, ' '));
      }
    });
    
    return changes.length > 0 ? `Changed: ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? '...' : ''}` : 'No changes detected';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Audit Log"
        description="Track all changes to financial records"
      >
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={isLoading}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULES.map((module) => (
                    <SelectItem key={module.value} value={module.value}>
                      {module.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm">
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
                  <Button variant="outline" className="w-full sm:w-[140px] justify-start text-left font-normal text-xs sm:text-sm">
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
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table - Desktop */}
      <Card className="hidden lg:block">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            Activity Log
            <Badge variant="secondary" className="ml-2 text-xs">
              {logs.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.performed_at), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getModuleLabel(log.table_name)}</Badge>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground">
                      {formatChanges(log)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit logs found for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Audit Log Cards - Mobile */}
      <div className="lg:hidden space-y-3">
        <div className="flex items-center gap-2 px-1">
          <FileText className="h-4 w-4" />
          <span className="font-semibold text-sm">Activity Log</span>
          <Badge variant="secondary" className="text-xs">
            {logs.length}
          </Badge>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No audit logs found
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{getModuleLabel(log.table_name)}</Badge>
                        {getActionBadge(log.action)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {formatChanges(log)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(log.performed_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 w-8 p-0"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="font-medium text-xs sm:text-sm">{format(new Date(selectedLog.performed_at), 'dd MMM yyyy HH:mm:ss')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Module</p>
                  <p className="font-medium text-xs sm:text-sm">{getModuleLabel(selectedLog.table_name)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  {getActionBadge(selectedLog.action)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Record ID</p>
                  <p className="font-mono text-[10px] sm:text-xs truncate">{selectedLog.record_id}</p>
                </div>
              </div>

              {selectedLog.old_data && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Previous Data</p>
                  <ScrollArea className="h-[120px] sm:h-[150px] rounded-md border p-2 sm:p-3">
                    <pre className="text-[10px] sm:text-xs">{JSON.stringify(selectedLog.old_data, null, 2)}</pre>
                  </ScrollArea>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">New Data</p>
                  <ScrollArea className="h-[120px] sm:h-[150px] rounded-md border p-2 sm:p-3">
                    <pre className="text-[10px] sm:text-xs">{JSON.stringify(selectedLog.new_data, null, 2)}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
