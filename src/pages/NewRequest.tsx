import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { StaffPublic } from '@/types/database';

const requestSchema = z.object({
  staffId: z.string().min(1, 'Please select a staff member'),
  amount: z.number().min(1, 'Amount must be greater than 0'),
  reason: z.string().min(5, 'Please provide a valid reason').max(500, 'Reason is too long'),
});

export default function NewRequest() {
  const navigate = useNavigate();
  const { user, staffData, isAccountant, accountingMode, isStaff, isAdmin, isOwner } = useAuth();

  const [staffList, setStaffList] = useState<StaffPublic[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStaff, setIsFetchingStaff] = useState(true);

  // Staff creating for themselves
  // Accountant in personal mode also creates for themselves
  const isPersonalRequest = isStaff || (isAccountant && !accountingMode);
  
  // Admin, Owner, Accountant (in accounting mode) can create for any staff
  const canRequestForOthers = isOwner || isAdmin || (isAccountant && accountingMode);

  useEffect(() => {
    if (isPersonalRequest && staffData?.id) {
      setSelectedStaff(staffData.id);
      setIsFetchingStaff(false);
    } else if (canRequestForOthers) {
      fetchStaffList();
    } else {
      setIsFetchingStaff(false);
    }
  }, [isPersonalRequest, staffData?.id, canRequestForOthers]);

  const fetchStaffList = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_public')
        .select('*')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setStaffList(data as StaffPublic[] || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setIsFetchingStaff(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      requestSchema.parse({
        staffId: selectedStaff,
        amount,
        reason,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    setIsLoading(true);
    try {
      const { data: newRequest, error } = await supabase
        .from('payment_requests')
        .insert({
          staff_id: selectedStaff,
          requested_by: user?.id,
          amount,
          reason: reason.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Notify Owner and Admin about new request
      const { data: approvers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['owner', 'admin']);

      if (approvers && newRequest) {
        const staffName = isPersonalRequest 
          ? staffData?.full_name 
          : staffList.find(s => s.id === selectedStaff)?.full_name || 'Staff';
        
        for (const approver of approvers) {
          if (approver.user_id !== user?.id) {
            await supabase.rpc('create_notification', {
              _user_id: approver.user_id,
              _title: 'New Payment Request',
              _message: `${staffName} has submitted a payment request of ₹${amount.toLocaleString('en-IN')} for "${reason.slice(0, 50)}${reason.length > 50 ? '...' : ''}"`,
              _type: 'info',
              _reference_type: 'payment_request',
              _reference_id: newRequest.id,
            });
          }
        }
      }

      toast.success('Request submitted successfully');
      navigate('/requests');
    } catch (error) {
      console.error('Error creating request:', error);
      toast.error('Failed to create request');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Payment Request"
        description="Submit a request for payment or advance"
      >
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </PageHeader>

      <Card className="max-w-2xl">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Request Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {isPersonalRequest 
              ? 'Fill in the details for your payment request'
              : 'Create a payment request on behalf of a staff member'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {/* Staff Selection - for Admin/Owner/Accountant in accounting mode */}
            {canRequestForOthers && (
              <div className="space-y-2">
                <Label htmlFor="staff" className="text-sm">Staff Member *</Label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id || ''}>
                        {s.full_name} ({s.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Personal request indicator */}
            {isPersonalRequest && staffData && (
              <div className="p-3 sm:p-4 bg-secondary rounded-lg">
                <p className="text-xs sm:text-sm text-muted-foreground">Requesting for</p>
                <p className="font-medium text-sm sm:text-base">{staffData.full_name}</p>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm">Amount *</Label>
              <AmountInput
                value={amount}
                onChange={setAmount}
                placeholder="Enter amount"
                className="h-12 text-lg"
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm">Reason *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide a reason for this request..."
                rows={4}
                className="text-base"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {reason.length}/500 characters
              </p>
            </div>

            {/* Submit */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={isLoading}
                className="h-11 order-2 sm:order-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="h-11 flex-1 order-1 sm:order-2">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    <span className="text-sm">Submitting...</span>
                  </>
                ) : (
                  <span className="text-sm">Submit Request</span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
