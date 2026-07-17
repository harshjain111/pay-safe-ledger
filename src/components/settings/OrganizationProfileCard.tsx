import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Pencil, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationProfile } from '@/hooks/useOrganizationProfile';
import { orgDisplayName } from '@/lib/organization';
import { OrganizationOnboardingDialog } from '@/components/organization/OrganizationOnboardingDialog';

/** Settings → Organisation: view + edit the org name, logo and details (same
 *  fields as first-run onboarding). Editing is gated on 'settings.organisation.edit'
 *  (owner always; plus anyone the owner grants it to). */
export function OrganizationProfileCard() {
  const { can } = useAuth();
  const { data: profile, isLoading } = useOrganizationProfile();
  const [editing, setEditing] = useState(false);
  const canEdit = can('settings.organisation.edit');

  const name = orgDisplayName(profile);
  const details: Array<[string, string | null | undefined]> = [
    ['Legal name', profile?.legal_name],
    ['Email', profile?.email],
    ['Phone', profile?.phone],
    ['Website', profile?.website],
    ['GSTIN', profile?.gstin],
    ['PAN', profile?.pan],
    ['Address', profile?.address],
    ['City', profile?.city],
    ['State', profile?.state],
    ['Pincode', profile?.pincode],
  ];
  const shown = details.filter(([, v]) => v && v.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Organisation Profile
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Company name, logo and details captured at onboarding. These appear on payslips,
          reports and in the sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-muted/40 flex items-center justify-center">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Organisation logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{name || 'Not set up yet'}</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.onboarded_at ? 'Organisation configured' : 'Onboarding not completed'}
                </p>
              </div>
            </div>

            {shown.length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {shown.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-dashed py-1">
                    <dt className="text-muted-foreground shrink-0">{label}</dt>
                    <dd className="font-medium text-right truncate">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {canEdit ? (
              <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="gap-1.5">
                <Pencil className="h-4 w-4" /> {name ? 'Edit details' : 'Set up organisation'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                You don't have permission to edit these details.
              </p>
            )}
          </>
        )}
      </CardContent>

      <OrganizationOnboardingDialog
        open={editing}
        onOpenChange={setEditing}
        profile={profile ?? null}
        mode="edit"
      />
    </Card>
  );
}
