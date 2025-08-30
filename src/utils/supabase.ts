// Placeholder Supabase client utils for SplitSmart AI
// TODO: Replace with actual @supabase/supabase-js client creation.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Creates a Supabase client using public environment variables.
// Safe for both server and client usage in this project.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createSupabaseClient(url, anon)
}
