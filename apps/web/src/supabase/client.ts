/**
 * The Supabase client and anonymous sign-in.
 *
 * Only the public URL and anon (publishable) key are used here. Both are meant
 * to be visible in the browser; the service role key lives solely in Edge
 * Function secrets and must never reach this bundle.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the app was built without Supabase settings — hot-seat still works. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Copy apps/web/.env.example to .env.local and fill it in.',
    );
  }
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/**
 * Returns the current user, signing in anonymously the first time. The session
 * is persisted, so a refresh keeps the same identity and the same seat.
 */
export async function signIn(): Promise<{ id: string }> {
  const client = supabase();

  const { data: existing } = await client.auth.getSession();
  if (existing.session?.user) return { id: existing.session.user.id };

  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(describeAuthError(error.message));
  if (!data.user) throw new Error('Could not start a session');
  return { id: data.user.id };
}

function describeAuthError(message: string): string {
  if (/anonymous/i.test(message)) {
    return 'Anonymous sign-ins are switched off for this Supabase project. Enable them under Authentication > Sign In / Providers.';
  }
  return message;
}

/** Calls an Edge Function and unwraps the error shape they all share. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });

  if (error) {
    // The function's own message is more useful than "non-2xx status code".
    const detail = await readFunctionError(error);
    throw new Error(detail ?? error.message);
  }
  return data as T;
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (typeof body.error === 'string') return body.error;
    } catch {
      return null;
    }
  }
  return null;
}
