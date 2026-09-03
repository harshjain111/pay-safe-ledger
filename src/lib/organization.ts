// The organisation profile shape and its display helper.
//
// Deliberately free of imports: AppLayout pulls orgDisplayName in on every
// page, so anything imported here lands in the entry bundle. The form's zod
// schema used to live alongside it and cost ~130 KB there — it now sits in
// organization-schema.ts, next to the two lazy screens that validate the form.

export interface OrgProfile {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  logo_url: string | null;
  onboarded_at: string | null;
  breaks_enabled?: boolean;
  self_checkin_enabled?: boolean;
  epf_number?: string | null;
  esi_number?: string | null;
  /** Short brand code printed on payslips (e.g. "K2H"). */
  brand_code?: string | null;
}

/** The name to display for the org (trade name preferred, else legal name). */
export function orgDisplayName(p: OrgProfile | null | undefined): string {
  return p?.trade_name?.trim() || p?.legal_name?.trim() || '';
}
