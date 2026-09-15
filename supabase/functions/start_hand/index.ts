/**
 * start_hand — shuffles, deals, and publishes the first public state.
 *
 * The shuffle happens here with `crypto.getRandomValues`, and the deck is
 * written to a table no client can read. Each player's two cards go to a row
 * only they can select. Everything else goes to `game_state`.
 */

import {
  createHand,
  cryptoRandomInt,
  nextSeatOf,
  shuffledDeck,
  stacksForNextHand,
  configForSettings,
} from '../_shared/engine/index.ts';
import { bankrollAfter, publishState, settingsOf } from '../_shared/game.ts';
import { badRequest, conflict, handle, json } from '../_shared/http.ts';
import { requireRoom, requireUser, serviceClient } from '../_shared/supabase.ts';

interface Body {
  roomId?: unknown;
}

Deno.serve(
  handle<Body>(async (body, req) => {
    const user = await requireUser(req);
    if (typeof body.roomId !== 'string') throw badRequest('A room id is required');

    const client = serviceClient();
    const room = await requireRoom(client, body.roomId, user.id);

    if (!room.guest_id) throw conflict('Nobody has joined this room yet');
    if (room.status === 'closed') throw conflict('That room is closed');

    // Refuse to deal over a hand that is still live.
    if (room.hand_number > 0) {
      const { data: current, error } = await client
        .from('hand_states')
        .select('state')
        .eq('room_id', room.id)
        .eq('hand_number', room.hand_number)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (current && (current.state as { complete?: boolean }).complete !== true) {
        throw conflict('That hand is still being played');
      }
    }

    const settings = settingsOf(room);
    const isFirstHand = room.hand_number === 0;
    const seatOf = isFirstHand
      ? ([0, 1] as [0 | 1, 0 | 1])
      : nextSeatOf(room.seat_of as [0 | 1, 0 | 1], settings);

    const stacks = stacksForNextHand(
      settings,
      seatOf,
      room.bankroll as [number, number],
      cryptoRandomInt,
      isFirstHand,
    );

    if (stacks[0] <= 0 || stacks[1] <= 0) {
      throw conflict('Somebody is out of chips. Reset the stacks to keep playing.');
    }

    const handNumber = room.hand_number + 1;
    const deck = shuffledDeck(cryptoRandomInt);
    const hand = createHand(configForSettings(settings, stacks), { deck, handNumber });

    // The deck as dealt, for audit. No client can read this table.
    const { error: deckError } = await client
      .from('decks')
      .upsert({ room_id: room.id, hand_number: handNumber, cards: deck });
    if (deckError) throw new Error(deckError.message);

    // Each player's own two cards, readable only by them.
    const people: [string, string] = [room.host_id, room.guest_id];
    const holeRows = ([0, 1] as const).map((seat) => ({
      room_id: room.id,
      hand_number: handNumber,
      player_id: people[seatOf[seat]],
      seat,
      cards: hand.players[seat].holeCards,
    }));
    const { error: holeError } = await client.from('hole_cards').upsert(holeRows);
    if (holeError) throw new Error(holeError.message);

    // The authoritative state, deck included. Denied to every client.
    const { error: stateError } = await client
      .from('hand_states')
      .upsert({ room_id: room.id, hand_number: handNumber, state: hand, version: 0 });
    if (stateError) throw new Error(stateError.message);

    // A hand can be over before anybody acts, if the blinds put both all-in.
    const bankroll = hand.complete ? bankrollAfter(hand, seatOf) : (room.bankroll as [number, number]);

    const { error: roomError } = await client
      .from('rooms')
      .update({
        hand_number: handNumber,
        seat_of: seatOf,
        status: 'playing',
        bankroll,
      })
      .eq('id', room.id);
    if (roomError) throw new Error(roomError.message);

    await publishState(client, room.id, hand, settings);

    return json({ roomId: room.id, handNumber, seatOf }, 201);
  }),
);
