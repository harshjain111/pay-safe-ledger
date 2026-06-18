// Loosely-typed re-export of the Supabase client.
// Use this in files where the auto-generated types cause spurious
// "excessively deep" errors or where we touch tables/RPCs that the
// generator has not yet inferred precisely. Runtime behaviour is identical
// to the typed `supabase` client exported from ./client.
import { supabase as typedClient } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = typedClient;
