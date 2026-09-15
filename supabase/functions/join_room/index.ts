/**
 * join_room — takes the seat opposite the host.
 *
 * Rejoining is fine: if the caller is already the host or the guest, this just
 * hands their room back, so a refresh or a reopened link always works.
 */

import { badRequest, conflict, handle, json, notFound } from '../_shared/http.ts';
import { requireUser, serviceClient, type RoomRow } from '../_shared/supabase.ts';

interface Body {
  code?: unknown;
}

Deno.serve(
  handle<Body>(async (body, req) => {
    const user = await requireUser(req);

    if (typeof body.code !== 'string' || body.code.trim().length === 0) {
      throw badRequest('A room code is required');
    }
    const code = body.code.trim().toUpperCase();

    const client = serviceClient();
    const { data, error } = await client.from('rooms').select('*').eq('code', code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw notFound('No room with that code');

    const room = data as RoomRow;
    if (room.status === 'closed') throw conflict('That room is closed');

    if (room.host_id === user.id) {
      return json({ roomId: room.id, code: room.code, role: 'host', rejoined: true });
    }
    if (room.guest_id === user.id) {
      return json({ roomId: room.id, code: room.code, role: 'guest', rejoined: true });
    }
    if (room.guest_id !== null) throw conflict('That room already has two players');

    // Only claim the seat if it is still free, so two people racing the same
    // link cannot both become the guest.
    const { data: claimed, error: claimError } = await client
      .from('rooms')
      .update({ guest_id: user.id, status: 'ready' })
      .eq('id', room.id)
      .is('guest_id', null)
      .select('id, code')
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    if (!claimed) throw conflict('Somebody else just took that seat');

    return json({ roomId: claimed.id, code: claimed.code, role: 'guest', rejoined: false });
  }),
);
