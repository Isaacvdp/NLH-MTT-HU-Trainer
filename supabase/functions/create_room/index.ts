/**
 * create_room — makes a table and returns the code that goes in the share link.
 *
 * The caller becomes the host. Settings are validated with the engine before
 * anything is stored, so a hand can always be dealt from them later.
 */

import { parseRoomSettings, RangeError, SettingsError } from '../_shared/engine/index.ts';
import { badRequest, handle, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

/** Unambiguous alphabet: no O/0, I/1, or similar look-alikes. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  const bytes = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

interface Body {
  settings?: unknown;
}

Deno.serve(
  handle<Body>(async (body, req) => {
    const user = await requireUser(req);

    let settings;
    try {
      settings = parseRoomSettings(body.settings);
    } catch (error) {
      if (error instanceof SettingsError || error instanceof RangeError) {
        throw badRequest(error.message);
      }
      throw error;
    }

    const client = serviceClient();

    // Codes are short enough that a collision is possible; retry a few times
    // rather than leaning on a single draw.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await client
        .from('rooms')
        .insert({
          code,
          host_id: user.id,
          settings,
          status: 'waiting',
          bankroll: [0, 0],
          seat_of: [0, 1],
          hand_number: 0,
        })
        .select('id, code')
        .single();

      if (!error && data) {
        return json({ roomId: data.id, code: data.code, role: 'host' }, 201);
      }
      // 23505 is a unique violation: the code was taken, so draw another.
      if (error && error.code !== '23505') throw new Error(error.message);
    }

    throw new Error('Could not allocate a room code');
  }),
);
