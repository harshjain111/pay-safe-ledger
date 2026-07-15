/**
 * App branding constants.
 *
 * The PRODUCT is "VIBRND HR BUDDY" by Vibrnd — shared across every deployment.
 *
 * The ORGANIZATION (the customer this deployment serves) is per-instance and can
 * be set via env, so a SEPARATE instance (e.g. Gloo) needs no code change:
 *   VITE_ORG_NAME=Gloo
 *   VITE_ORG_SHORT_NAME=Gloo         (optional)
 *   VITE_ORG_SHORT=GL                (optional 2-letter badge; else derived)
 *   VITE_ORG_LOGO=/gloo-logo.png     (optional; add the image to public/)
 * With no env set, the defaults reproduce the original Konnect deployment exactly.
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
const orgName = env.VITE_ORG_NAME || 'Konnect 2 Hospitality';

export const ORGANIZATION = {
  name: orgName,
  shortName: env.VITE_ORG_SHORT_NAME || 'Konnect 2',
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
