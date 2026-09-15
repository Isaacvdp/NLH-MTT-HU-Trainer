/**
 * The pieces of a hand's lifecycle that `start_hand` and `act` both need:
 * writing the authoritative state privately, publishing the safe view, and
 * keeping the room's bankroll in step when a hand ends.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  isSafeToPublish,
  parseRoomSettings,
  revealedSeats,
  toPublicState,
  type HandState,
  type PlayerIndex,
  type RoomSettings,
} from './engine/index.ts';
import type { RoomRow } from './supabase.ts';

export function settingsOf(room: RoomRow): RoomSettings {
  // Stored settings were validated on the way in; re-parsing keeps a hand
  // rolling on data that a migration or manual edit may have changed.
  return parseRoomSettings(room.settings);
}

/**
 * Writes the public view of a hand to `game_state`, where both players can read
 * it and Realtime will push it to them.
 */
export async function publishState(
  client: SupabaseClient,
  roomId: string,
  hand: HandState,
  settings: RoomSettings,
): Promise<void> {
  const reveal = revealedSeats(hand, settings.revealHandsAfterHand);
  const view = toPublicState(hand, { reveal });

  // Belt and braces: never write a row that leaks a card.
  if (!isSafeToPublish(view, reveal)) {
    throw new Error('Refusing to publish a state that exposes hidden cards');
  }

  const { error } = await client
    .from('game_state')
    .upsert({ room_id: roomId, hand_number: hand.handNumber, state: view }, { onConflict: 'room_id' });
  if (error) throw new Error(error.message);
}

/** Bankroll is indexed by person; hand stacks are indexed by seat. */
export function bankrollAfter(hand: HandState, seatOf: [number, number]): [number, number] {
  const bankroll: [number, number] = [0, 0];
  for (const seat of [0, 1] as const) {
    bankroll[seatOf[seat] as 0 | 1] = hand.players[seat].stack;
  }
  return bankroll;
}

export function seatIndex(value: number): PlayerIndex {
  return value === 0 ? 0 : 1;
}
