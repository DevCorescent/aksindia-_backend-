import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Service-role client — bypasses RLS. Only used server-side, never exposed to clients.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client — used only for verifying user JWTs via supabase.auth.getUser(token)
export const supabaseAnon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
