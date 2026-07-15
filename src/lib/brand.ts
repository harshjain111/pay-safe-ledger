/**
 * App branding constants.
 *
 * The PRODUCT is "VIBRND HR BUDDY" by Vibrnd — shared across every deployment.
 *
 * The ORGANIZATION (the customer this deployment serves) is per-instance and set
 * via env, so each deployment brands itself with no code change:
 *   VITE_ORG_NAME=Gloo
 *   VITE_ORG_SHORT_NAME=Gloo         (optional)
 *   VITE_ORG_SHORT=GL                (optional 2-letter badge; else derived)
 *   VITE_ORG_LOGO=/gloo-logo.png     (optional; add the image to public/)
 * With no VITE_ORG_NAME set, NO organization is shown (generic product): the
 * home/header/org-card omit it, and documents fall back to the product name.
 */
import vibrndLogo from '@/assets/vibrnd-logo.png';
import vibrndLogoWhite from '@/assets/vibrnd-logo-white.png';

export const BRAND = {
  productName: 'VIBRND HR BUDDY',
  shortName: 'VIBRND HR',
  company: 'Vibrnd',
  tagline: 'HR & Payroll Suite',
  logo: vibrndLogo,
  logoWhite: vibrndLogoWhite,
  logoPath: '/vibrnd-logo.png',
} as const;

const env = import.meta.env as Record<string, string | undefined>;
const orgName = env.VITE_ORG_NAME || '';

export const ORGANIZATION = {
  name: orgName,
  shortName: env.VITE_ORG_SHORT_NAME || '',
  /** 2-letter badge shown in the sidebar org card (derived if not set). */
  shortCode:
    env.VITE_ORG_SHORT ||
    orgName
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  /** Optional org logo (public path or URL). Falls back to the badge / product logo. */
  logo: env.VITE_ORG_LOGO || null,
} as const;

/** Non-empty label for documents (payslips/reports); falls back to the product. */
export const ORG_LABEL = ORGANIZATION.name || BRAND.productName;
