import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, 
  CheckCircle2, 
  Receipt,
  Camera,
  Upload,
  Plane,
  UtensilsCrossed,
  Truck,
  Wrench,
  Briefcase,
  Phone,
  MoreHorizontal,
  X,
  Image,
} from 'lucide-react';
import type { ExpenseCategory } from '@/types/database';

interface QuickExpenseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Club {
  id: string;
  name: string;
}

const categories: { id: ExpenseCategory; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'travel', icon: <Plane className="h-6 w-6" />, labelKey: 'travel' },
  { id: 'food', icon: <UtensilsCrossed className="h-6 w-6" />, labelKey: 'food' },
  { id: 'logistics', icon: <Truck className="h-6 w-6" />, labelKey: 'logistics' },
  { id: 'equipment', icon: <Wrench className="h-6 w-6" />, labelKey: 'equipment' },
  { id: 'office_supplies', icon: <Briefcase className="h-6 w-6" />, labelKey: 'office_supplies' },
  { id: 'communication', icon: <Phone className="h-6 w-6" />, labelKey: 'communication' },
  { id: 'other', icon: <MoreHorizontal className="h-6 w-6" />, labelKey: 'other' },
];

export function QuickExpenseForm({ open, onOpenChange, onSuccess }: QuickExpenseFormProps) {
  const { t } = useLanguage();
  const { staffData } = useAuth();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      supabase.from('clubs').select('id, name').eq('is_active', true).order('name')
        .then(({ data }) => { if (data) setClubs(data); });
    }
  }, [open]);

  // Custom category name is required for "other" category
  const isOtherCategory = category === 'other';

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error(t('enter_valid_amount'));
      return;
    }

    if (!category) {
      toast.error(t('select_category'));
      return;
    }

    // Require custom category name for "other" category
    if (isOtherCategory && !customCategory.trim()) {
      toast.error(t('category_name_required'));
      return;
    }

    // Description is always required
    if (!description.trim()) {
      toast.error(t('description_required'));
      return;
    }

    if (!staffData?.id) {
      toast.error(t('error_occurred'));
      return;
    }

    setIsSubmitting(true);
    try {
      let proofUrl: string | null = null;

      // Upload photo if exists
      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${staffData.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('expense-proofs')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          proofUrl = fileName;
        }
      }

      // Use custom category name for "other", otherwise use category label
      const categoryLabel = isOtherCategory ? customCategory.trim() : t(category);

      const { error } = await supabase.from('expenses').insert({
        staff_id: staffData.id,
        amount: numAmount,
        category,
        description: description.trim(),
        status: 'pending',
        submitted_at: new Date().toISOString(),
        proof_url: proofUrl,
        club_id: selectedClubId || null,
      });

      if (error) throw error;

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setAmount('');
        setCategory(null);
        setDescription('');
        setCustomCategory('');
        setSelectedClubId('');
        setPhoto(null);
        setPhotoPreview(null);
        onOpenChange(false);
        onSuccess();
      }, 1500);
    } catch (error) {
      console.error('Error submitting expense:', error);
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
            <h2 className="text-xl font-bold text-center">{t('expense_success')}</h2>
            <p className="text-muted-foreground text-center">{t('request_sent')}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Receipt className="h-6 w-6 text-primary" />
            {t('request_expense')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount Input */}
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

          {/* Category Selection - Icon Grid */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('category')}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                    category === cat.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {cat.icon}
                  <span className="text-xs mt-1 font-medium truncate w-full text-center">
                    {t(cat.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Category Input - Shows when "Other" is selected */}
          {isOtherCategory && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                {t('category_name')} *
              </label>
              <Input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder={t('enter_category_name')}
                className="h-12 text-base"
                autoFocus
              />
            </div>
          )}

          {/* Description Input - Always visible */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('description')} *
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('enter_description')}
              className="min-h-[80px] text-base"
            />
          </div>
          {/* Club Selection (Optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Club
            </label>
            <Select value={selectedClubId || 'none'} onValueChange={(v) => setSelectedClubId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Select club (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No club</SelectItem>
                {clubs.map((club) => (
                  <SelectItem key={club.id} value={club.id}>
                    {club.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Photo Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('upload_receipt')}
            </label>
            
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-xs">{t('take_photo')}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Image className="h-6 w-6" />
                  <span className="text-xs">{t('upload_photo')}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !amount || !category}
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
