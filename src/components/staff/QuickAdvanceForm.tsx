import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { NotificationEvents } from '@/lib/notifications';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, Wallet } from 'lucide-react';

interface QuickAdvanceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function QuickAdvanceForm({ open, onOpenChange, onSuccess }: QuickAdvanceFormProps) {
  const { t } = useLanguage();
  const { staffData, user } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error(t('enter_valid_amount'));
      return;
    }

    if (!staffData?.id || !user?.id) {
      toast.error(t('error_occurred'));
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('payment_requests').insert({
        staff_id: staffData.id,
        requested_by: user.id,
        amount: numAmount,
        reason: note || t('request_advance'),
        status: 'pending',
        payout_type: 'advance',
      });

      if (error) throw error;

      // Send notifications to owners and admins
      NotificationEvents.advanceRequested(
        staffData.full_name,
        numAmount,
        '' // request ID not available from insert
      );

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setAmount('');
        setNote('');
        onOpenChange(false);
        onSuccess();
      }, 1500);
    } catch (error) {
      console.error('Error submitting advance request:', error);
      toast.error(t('error_occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-xl font-bold text-center">{t('advance_success')}</h2>
            <p className="text-muted-foreground text-center">{t('request_sent')}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Wallet className="h-6 w-6 text-primary" />
            {t('request_advance')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount Input - Large and prominent */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('amount')}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-16 pl-10 text-3xl font-bold text-center"
                autoFocus
              />
            </div>
          </div>

          {/* Note - Optional */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('note')}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('add_note')}
              className="min-h-[80px] text-base"
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !amount}
            className="w-full h-14 text-lg font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
