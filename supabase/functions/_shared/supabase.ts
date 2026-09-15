/** Supabase clients and caller identity. */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { forbidden, notFound, unauthorized } from './http.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/**
 * Bypasses row-level security. Only ever used inside a function, after the
 * caller has been identified and checked against the room they are acting on.
 */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the signed-in user from the request's bearer token. */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw unauthorized();

  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw unauthorized('Your session has expired');
  return { id: data.user.id };
}

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  settings: Record<string, unknown>;
  bankroll: [number, number];
  seat_of: [number, number];
  hand_number: number;
  status: 'waiting' | 'ready' | 'playing' | 'closed';
}

/** Loads a room and checks the caller belongs to it. */
export async function requireRoom(
  client: SupabaseClient,
  roomId: string,
  userId: string,
): Promise<RoomRow> {
  const { data, error } = await client.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound('No such room');

  const room = data as RoomRow;
  if (room.host_id !== userId && room.guest_id !== userId) {
    throw forbidden('You are not in this room');
  }
  return room;
}

/** 0 for the host, 1 for the guest. */
export function personIndex(room: RoomRow, userId: string): 0 | 1 {
  if (room.host_id === userId) return 0;
  if (room.guest_id === userId) return 1;
  throw forbidden('You are not in this room');
}

/** Which engine seat a person is sitting in this hand. */
export function seatOfPerson(room: RoomRow, person: 0 | 1): 0 | 1 {
  return room.seat_of[0] === person ? 0 : 1;
}
