import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ClipboardList, Check, X, Loader2, ArrowRight, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import type { PaymentRequest, StaffPublic } from '@/types/database';
import { refetchNotificationCounts } from '@/hooks/useNotificationCounts';
import { CancelApprovalDialog } from '@/components/expenses/CancelApprovalDialog';

interface RequestWithStaff extends PaymentRequest {
  staff: StaffPublic;
}

export default function Requests() {
  const { 
    isOwner, 
    isAdmin, 
    isStaff, 
    staffData, 
    user, 
    isAccountant, 
    accountingMode,
    canApproveRequests
  } = useAuth();
  
  const [requests, setRequests] = useState<RequestWithStaff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<RequestWithStaff | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [cancelRequest, setCancelRequest] = useState<RequestWithStaff | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('payment_requests')
        .select(`
          *,
          staff:staff_id (
            id, user_id, employee_id, full_name, email, phone, 
            department, designation, date_of_joining, is_active, 
            created_at, updated_at
          )
        `)
        .order('created_at', { ascending: false });

      // CRITICAL: Personal context filtering
      // Staff always sees only their own requests
      // Accountant in personal mode (My Account) sees only their own requests
      // This ensures complete isolation between personal and role contexts
      if (isStaff || (isAccountant && !accountingMode)) {
        if (staffData?.id) {
          query = query.eq('staff_id', staffData.id);
        } else {
          // No staff record - return empty
          setRequests([]);
          setIsLoading(false);
          return;
        }
      }

      // Filter by status
      if (activeTab !== 'all' && (activeTab === 'pending' || activeTab === 'approved' || activeTab === 'rejected')) {
        query = query.eq('status', activeTab);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data as RequestWithStaff[] || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isStaff, isAccountant, accountingMode, staffData?.id, activeTab]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (request: RequestWithStaff) => {
    // Prevent self-benefit approval - cannot approve requests where YOU are the beneficiary
    // But you CAN approve requests you created on behalf of others
    if (request.staff?.user_id === user?.id) {
      toast.error('You cannot approve requests for yourself');
      return;
    }

    setIsProcessing(true);
    try {
      const approverName = getUserDisplayName(user, staffData);

      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          approved_by_user_name: approverName,
        })
        .eq('id', request.id);

      if (error) throw error;

      // Notify the staff member
      if (request.staff?.user_id) {
        await supabase.rpc('create_notification', {
          _user_id: request.staff.user_id,
          _title: 'Request Approved',
          _message: `Your payment request of ₹${request.amount.toLocaleString('en-IN')} has been approved and is ready for payout.`,
          _type: 'success',
          _reference_type: 'payment_request',
          _reference_id: request.id,
        });
      }

      // Notify payout executors (server-side fan-out; excludes the approver).
      await supabase.rpc('notify_users_by_role', {
        _roles: ['accountant', 'owner', 'admin'],
        _title: 'Request Ready for Payout',
        _message: `Advance request for ${request.staff?.full_name} (₹${request.amount.toLocaleString('en-IN')}) is approved and ready in Payouts.`,
        _type: 'info',
        _reference_type: 'payment_request',
        _reference_id: request.id,
      });

      toast.success('Request approved - now available in Payouts');
      
      // Immediately update notification counts
      refetchNotificationCounts();
      
      fetchRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      toast.error((error as { message?: string })?.message || 'Failed to approve request');
    } finally {
      setIsProcessing(false);
      setSelectedRequest(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    
    setIsProcessing(true);
    try {
      const approverName = getUserDisplayName(user, staffData);

      const { error } = await supabase
        .from('payment_requests')
        .update({
          status: 'rejected',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          approved_by_user_name: approverName,
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Notify the staff member
      if (selectedRequest.staff?.user_id) {
        await supabase.rpc('create_notification', {
          _user_id: selectedRequest.staff.user_id,
          _title: 'Request Rejected',
          _message: `Your payment request of ₹${selectedRequest.amount.toLocaleString('en-IN')} has been rejected. Reason: ${rejectionReason}`,
          _type: 'error',
          _reference_type: 'payment_request',
          _reference_id: selectedRequest.id,
        });
      }

      toast.success('Request rejected');
      
      // Immediately update notification counts
      refetchNotificationCounts();
      
      setRejectionReason('');
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error('Failed to reject request');
    } finally {
      setIsProcessing(false);
      setSelectedRequest(null);
    }
  };

  // Permission checks using centralized auth context
  // Owner and Admin can approve - Accountant CANNOT approve
  const canApprove = canApproveRequests;
  
  // Staff, Accountant, and Admin can create requests
  // Owner can also create but usually doesn't need to
  const canCreateRequest = isStaff || isAccountant || isAdmin || isOwner;

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Request Advance"
        description={
          canApprove
            ? "Review and approve advance requests"
            : "View and create advance requests"
        }
      >
        {canCreateRequest && (
          <Link to="/requests/new">
            <Button className="text-sm sm:text-base px-3 sm:px-4">
              <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>
        )}
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
          <TabsTrigger value="pending" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">Rejected</TabsTrigger>
          <TabsTrigger value="all" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <ListSkeleton variant="rows" />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No requests found"
              description={
                activeTab === 'pending'
                  ? "No pending requests at the moment"
                  : "No requests match the selected filter"
              }
            />
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block md:hidden divide-y">
                {requests.map((request) => (
                  <div key={request.id} className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">{request.staff?.full_name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {request.staff?.employee_id} • {format(new Date(request.created_at), 'dd MMM')}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{request.reason}</p>
                    {request.approved_by_user_name && request.status !== 'pending' && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground italic">
                        {request.status === 'rejected' ? 'Rejected' : 'Approved'} by: {request.approved_by_user_name}
                      </p>
                    )}
                    {request.rejection_reason && (
                      <p className="text-[10px] sm:text-xs text-destructive line-clamp-1">
                        Reason: {request.rejection_reason}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 sm:pt-2">
                      <Amount value={request.amount} size="lg" />
                      <div className="flex gap-1 sm:gap-2">
                        {canApprove && request.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-success hover:text-success h-8 w-8 sm:h-9 sm:w-9 p-0"
                              onClick={() => handleApprove(request)}
                              disabled={isProcessing}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive h-8 w-8 sm:h-9 sm:w-9 p-0"
                              onClick={() => setSelectedRequest(request)}
                              disabled={isProcessing}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {request.status === 'approved' && (isOwner || isAdmin || isAccountant) && (
                          <Link to="/payouts">
                            <Button size="sm" variant="outline" className="gap-1 h-8 text-xs px-2">
                              Payouts
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                        {request.status === 'approved' && !request.paid_at && (isOwner || isAdmin) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive h-8 w-8 p-0"
                            onClick={() => setCancelRequest(request)}
                            title="Cancel Approval"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow className="bg-secondary/50">
                       <TableHead>Date</TableHead>
                       <TableHead>Staff</TableHead>
                       <TableHead className="max-w-[300px]">Reason</TableHead>
                       <TableHead className="text-right">Amount</TableHead>
                       <TableHead>Status</TableHead>
                       <TableHead>Approved By</TableHead>
                       <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(request.created_at), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.staff?.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {request.staff?.employee_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate">{request.reason}</p>
                          {request.rejection_reason && (
                            <p className="text-xs text-destructive mt-1">
                              Rejected: {request.rejection_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={request.amount} />
                        </TableCell>
                         <TableCell>
                           <StatusBadge status={request.status} />
                         </TableCell>
                         <TableCell>
                           {request.approved_by_user_name ? (
                             <span className="text-sm text-muted-foreground">{request.approved_by_user_name}</span>
                           ) : (
                             <span className="text-sm text-muted-foreground">—</span>
                           )}
                         </TableCell>
                         <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canApprove && request.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-success hover:text-success"
                                  onClick={() => handleApprove(request)}
                                  disabled={isProcessing}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setSelectedRequest(request)}
                                  disabled={isProcessing}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {request.status === 'approved' && (isOwner || isAdmin || isAccountant) && (
                              <Link to="/payouts">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-xs"
                                >
                                  Payouts
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              </Link>
                            )}
                            {request.status === 'approved' && !request.paid_at && (isOwner || isAdmin) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive gap-1 text-xs"
                                onClick={() => setCancelRequest(request)}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            )}
                          </div>
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

      {/* Rejection Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for rejection</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedRequest(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Approval Dialog */}
      <CancelApprovalDialog
        open={!!cancelRequest}
        onOpenChange={(open) => !open && setCancelRequest(null)}
        onSuccess={() => {
          setCancelRequest(null);
          fetchRequests();
        }}
        item={cancelRequest ? {
          id: cancelRequest.id,
          type: 'advance',
          staffName: cancelRequest.staff?.full_name || 'Staff',
          staffId: cancelRequest.staff_id,
          staffUserId: cancelRequest.staff?.user_id,
          amount: cancelRequest.amount,
          description: cancelRequest.reason,
        } : null}
      />
    </div>
  );
}
