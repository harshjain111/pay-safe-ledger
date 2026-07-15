import { z } from 'zod';

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
}

// Every field is optional at the field level; the refine enforces "trade name OR
// legal name". Format checks only fire when a value is present (the `^$|` branch).
const opt = (max = 120) => z.string().trim().max(max).optional().or(z.literal(''));

export const organizationFormSchema = z
  .object({
    trade_name: opt(),
    legal_name: opt(),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    website: z.string().trim().url('Enter a valid URL (https://…)').optional().or(z.literal('')),
    phone: opt(20),
    gstin: z
      .string()
      .trim()
      .regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i, 'Enter a valid 15-character GSTIN')
      .optional()
      .or(z.literal('')),
    pan: z
      .string()
      .trim()
      .regex(/^$|^[A-Z]{5}[0-9]{4}[A-Z]$/i, 'Enter a valid PAN (AAAAA9999A)')
      .optional()
      .or(z.literal('')),
    address: opt(300),
    city: opt(80),
    state: opt(80),
    pincode: z.string().trim().regex(/^$|^[0-9]{6}$/, 'Enter a 6-digit pincode').optional().or(z.literal('')),
  })
  .refine((d) => Boolean(d.trade_name?.trim()) || Boolean(d.legal_name?.trim()), {
    message: 'Enter at least the Trade name or the Legal name',
    path: ['trade_name'],
  });

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

/** The name to display for the org (trade name preferred, else legal name). */
export function orgDisplayName(p: OrgProfile | null | undefined): string {
  return p?.trade_name?.trim() || p?.legal_name?.trim() || '';
}
