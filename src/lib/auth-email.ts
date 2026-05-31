// Phone-number logins are bridged to Supabase auth (which requires an email) by
// synthesizing a pseudo-email of the form `<digits>@<PHONE_EMAIL_DOMAIN>`.
//
// This domain is baked into every user's auth identifier, so it MUST stay in sync
// across three places or existing users can no longer sign in:
//   1. this frontend value (VITE_PHONE_EMAIL_DOMAIN),
//   2. the edge functions (PHONE_EMAIL_DOMAIN env var), and
//   3. the email column on existing auth.users rows (see the matching SQL migration).
//
// The `.internal` suffix is a reserved, non-routable TLD — these addresses never
// receive mail; they are only identifiers. Override via env if you need a different
// neutral domain; the default carries no client/brand name.
export const PHONE_EMAIL_DOMAIN =
  import.meta.env.VITE_PHONE_EMAIL_DOMAIN || 'phone.payroll.internal';

export const phoneToEmail = (phone: string): string => {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  return `${cleanPhone}@${PHONE_EMAIL_DOMAIN}`;
};
