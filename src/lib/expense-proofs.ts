import { supabase } from '@/integrations/supabase/client';

/**
 * Expense proofs are stored in the private `expense-proofs` bucket. A single
 * expense may carry MULTIPLE files, persisted in `expenses.proof_url` as a
 * comma-joined list of storage paths (see NewExpense.uploadProofs). Readers must
 * therefore split the value and mint a signed URL per path — handing the whole
 * comma-joined string to createSignedUrl() treats it as one (non-existent) key
 * and silently breaks every multi-file proof. (audit P3-H5)
 *
 * Returns one signed URL per resolvable file (empty array if none / on error).
 */
export async function getExpenseProofUrls(
  proofUrl: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string[]> {
  const paths = (proofUrl ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (paths.length === 0) return [];

  const { data, error } = await supabase.storage
    .from('expense-proofs')
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    console.error('Error getting expense proof signed URLs:', error);
    return [];
  }
  return data.map((d) => d.signedUrl).filter(Boolean) as string[];
}
