import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/anyClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  organizationFormSchema,
  type OrganizationFormValues,
  type OrgProfile,
} from '@/lib/organization';
import { ORG_PROFILE_QUERY_KEY } from '@/hooks/useOrganizationProfile';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: OrgProfile | null;
  /** onboarding = blocking first-run (cannot dismiss); edit = from Settings. */
  mode?: 'onboarding' | 'edit';
  /** "Sign out" escape hatch shown in blocking onboarding mode. */
  onSignOut?: () => void;
}

const nullify = (v?: string) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export function OrganizationOnboardingDialog({ open, onOpenChange, profile, mode = 'onboarding', onSignOut }: Props) {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      trade_name: '', legal_name: '', email: '', website: '', phone: '',
      gstin: '', pan: '', address: '', city: '', state: '', pincode: '',
    },
  });

  // Re-seed the form whenever the dialog opens with the latest saved values.
  useEffect(() => {
    if (!open) return;
    reset({
      trade_name: profile?.trade_name ?? '',
      legal_name: profile?.legal_name ?? '',
      email: profile?.email ?? '',
      website: profile?.website ?? '',
      phone: profile?.phone ?? '',
      gstin: profile?.gstin ?? '',
      pan: profile?.pan ?? '',
      address: profile?.address ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      pincode: profile?.pincode ?? '',
    });
    setLogoFile(null);
    setLogoPreview(profile?.logo_url ?? null);
  }, [open, profile, reset]);

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Too large', description: 'Logo must be under 2 MB.', variant: 'destructive' });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (values: OrganizationFormValues) => {
    try {
      let logoUrl = profile?.logo_url ?? null;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() || 'png';
        const path = `logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('org-assets')
          .upload(path, logoFile, { upsert: true, cacheControl: '3600' });
        if (upErr) throw upErr;
        logoUrl = supabase.storage.from('org-assets').getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase
        .from('organization_profile')
        .update({
          trade_name: nullify(values.trade_name),
          legal_name: nullify(values.legal_name),
          email: nullify(values.email),
          website: nullify(values.website),
          phone: nullify(values.phone),
          gstin: nullify(values.gstin)?.toUpperCase() ?? null,
          pan: nullify(values.pan)?.toUpperCase() ?? null,
          address: nullify(values.address),
          city: nullify(values.city),
          state: nullify(values.state),
          pincode: nullify(values.pincode),
          logo_url: logoUrl,
          onboarded_at: profile?.onboarded_at ?? new Date().toISOString(),
        })
        .eq('singleton', true);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ORG_PROFILE_QUERY_KEY });
      toast({ title: 'Saved', description: 'Organization details updated.' });
      onOpenChange(false);
    } catch (err) {
      console.error('Save organization profile failed:', err);
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent
        className={`max-w-2xl max-h-[90vh] overflow-y-auto ${mode === 'onboarding' ? '[&>button]:hidden' : ''}`}
        onEscapeKeyDown={(e) => { if (mode === 'onboarding') e.preventDefault(); }}
        onInteractOutside={(e) => { if (mode === 'onboarding') e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {mode === 'onboarding' ? 'Set up your organization' : 'Organization details'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'onboarding'
              ? 'Add your organization details to continue — at least the Trade name or Legal name is required. These appear on payslips, reports, and the sidebar, and can be edited later in Settings.'
              : 'These appear on payslips, reports, and in the sidebar.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted/40 flex items-center justify-center">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Logo</Label>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onLogoChange} className="hidden" />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" /> {logoPreview ? 'Change logo' : 'Upload logo'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">PNG/JPG/SVG, up to 2 MB. Shown in the sidebar.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Trade name *" error={errors.trade_name?.message}>
              <Input {...register('trade_name')} placeholder="e.g. Acme Solutions Pvt Ltd" />
            </Field>
            <Field label="Legal name" error={errors.legal_name?.message}>
              <Input {...register('legal_name')} placeholder="Registered legal entity name" />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...register('email')} placeholder="accounts@company.com" />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input {...register('phone')} placeholder="Contact number" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Website" error={errors.website?.message}>
                <Input {...register('website')} placeholder="https://company.com" />
              </Field>
            </div>
            <Field label="GSTIN" error={errors.gstin?.message}>
              <Input {...register('gstin')} placeholder="15-character GSTIN" className="uppercase" />
            </Field>
            <Field label="PAN" error={errors.pan?.message}>
              <Input {...register('pan')} placeholder="AAAAA9999A" className="uppercase" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" error={errors.address?.message}>
                <Textarea {...register('address')} rows={2} placeholder="Registered / office address" />
              </Field>
            </div>
            <Field label="City" error={errors.city?.message}>
              <Input {...register('city')} />
            </Field>
            <Field label="State" error={errors.state?.message}>
              <Input {...register('state')} />
            </Field>
            <Field label="Pincode" error={errors.pincode?.message}>
              <Input {...register('pincode')} placeholder="6 digits" />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {mode === 'onboarding' ? (
              <Button type="button" variant="ghost" onClick={onSignOut} disabled={isSubmitting} className="text-muted-foreground">
                Sign out
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : 'Save details'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
