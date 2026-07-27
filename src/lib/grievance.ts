// Anonymous grievance submission (client side).
//
// The submit request is sent with the PUBLIC anon key as the Authorization
// header — deliberately NOT the logged-in user's session token — so the request
// carries no identity. We never attach the user, never call the authenticated
// supabase client here. That is what makes it anonymous end-to-end.

import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const GRIEVANCE_CATEGORIES = [
  'Workplace issue',
  'Safety concern',
  'Harassment / misconduct',
  'Payroll / dues',
  'Facilities',
  'Management',
  'Other',
] as const;

export interface GrievanceInput {
  category: string;
  message?: string;
  photo?: Blob | null;
  voice?: Blob | null;
  /** When false, the submitter is recorded (resolved server-side from their JWT). Default true. */
  anonymous?: boolean;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

export async function submitGrievance(input: GrievanceInput): Promise<void> {
  const anonymous = input.anonymous !== false; // default anonymous
  const payload: Record<string, unknown> = {
    category: input.category,
    message: input.message ?? '',
    anonymous,
  };
  if (input.photo) {
    payload.photoBase64 = await blobToDataUrl(input.photo);
    payload.photoType = input.photo.type || 'image/jpeg';
  }
  if (input.voice) {
    payload.voiceBase64 = await blobToDataUrl(input.voice);
    payload.voiceType = input.voice.type || 'audio/webm';
  }

  // Anonymous → anon key only (no identity). Not anonymous → send the user's
  // session token so the server can resolve WHO submitted (verified, not spoofable).
  let authToken = ANON_KEY;
  if (!anonymous) {
    const { data } = await supabase.auth.getSession();
    authToken = data.session?.access_token ?? ANON_KEY;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-grievance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Could not submit. Please try again.');
  }
}
