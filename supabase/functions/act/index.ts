/**
 * act — validates one action against the rules engine and advances the hand.
 *
 * The client never sends state, only what it wants to do. The authoritative
 * state is loaded here, the engine decides whether the action is legal, and the
 * result is written back under an optimistic version check so two requests
 * cannot both apply on top of the same state.
 */

import { applyAction, type Action, type HandState } from '../_shared/engine/index.ts';
import { bankrollAfter, publishState, seatIndex, settingsOf } from '../_shared/game.ts';
import { badRequest, conflict, forbidden, handle, json, notFound } from '../_shared/http.ts';
import { personIndex, requireRoom, requireUser, seatOfPerson, serviceClient } from '../_shared/supabase.ts';

interface Body {
  roomId?: unknown;
  action?: unknown;
}

const ACTION_TYPES = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];

/** Turns untrusted JSON into an `Action`, or rejects it. */
function parseAction(input: unknown): Action {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw badRequest('An action is required');
  }
  const source = input as Record<string, unknown>;
  const type = source['type'];
  if (typeof type !== 'string' || !ACTION_TYPES.includes(type)) {
    throw badRequest(`Action type must be one of: ${ACTION_TYPES.join(', ')}`);
  }

  if (type === 'bet' || type === 'raise') {
    const to = source['to'];
    if (typeof to !== 'number' || !Number.isInteger(to) || to <= 0) {
      throw badRequest('A bet or raise needs a whole number to raise to');
    }
    return { type, to } as Action;
  }
  return { type } as Action;
}

Deno.serve(
  handle<Body>(async (body, req) => {
    const user = await requireUser(req);
    if (typeof body.roomId !== 'string') throw badRequest('A room id is required');
    const action = parseAction(body.action);

    const client = serviceClient();
    const room = await requireRoom(client, body.roomId, user.id);
    if (room.hand_number === 0) throw conflict('No hand has been dealt yet');

    const { data: row, error } = await client
      .from('hand_states')
      .select('state, version')
      .eq('room_id', room.id)
      .eq('hand_number', room.hand_number)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw notFound('No hand in progress');

    const current = row.state as HandState;
    if (current.complete) throw conflict('That hand is already over');

    const seat = seatOfPerson(room, personIndex(room, user.id));
    if (current.toAct !== seatIndex(seat)) throw forbidden('It is not your turn');

    let next: HandState;
    try {
      next = applyAction(current, action, seatIndex(seat));
    } catch (engineError) {
      // The engine's messages name the legal alternatives, which is exactly
      // what a client needs to recover.
      throw badRequest(engineError instanceof Error ? engineError.message : 'Illegal action');
    }

    // Only apply on top of the state we actually read.
    const { data: saved, error: saveError } = await client
      .from('hand_states')
      .update({ state: next, version: row.version + 1 })
      .eq('room_id', room.id)
      .eq('hand_number', room.hand_number)
      .eq('version', row.version)
      .select('version')
      .maybeSingle();
    if (saveError) throw new Error(saveError.message);
    if (!saved) throw conflict('Somebody else acted first; try again');

    const settings = settingsOf(room);

    if (next.complete) {
      const { error: roomError } = await client
        .from('rooms')
        .update({
          bankroll: bankrollAfter(next, room.seat_of),
          status: 'ready',
        })
        .eq('id', room.id);
      if (roomError) throw new Error(roomError.message);
    }

    await publishState(client, room.id, next, settings);

    return json({ ok: true, complete: next.complete, handNumber: next.handNumber });
  }),
);
