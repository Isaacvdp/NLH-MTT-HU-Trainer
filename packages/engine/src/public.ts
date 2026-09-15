/**
 * Turning an authoritative hand into something safe to publish.
 *
 * The server keeps the full `HandState` — deck included — and writes only a
 * `PublicHandState` to the table both players can read. Hole cards appear there
 * only for seats that are genuinely public: at showdown, or when the room is set
 * to reveal hands after each hand. A player reads their own cards from a
 * separate row that row-level security restricts to them.
 */

import { legalActions } from './actions.js';
import type { HandEvent, HandState, PlayerIndex, PlayerState, PublicHandState } from './types.js';

export interface PublicViewOptions {
  /** Seats whose hole cards may be shown to everyone. */
  reveal?: readonly PlayerIndex[];
}

/**
 * Which seats are public once a hand is over. At showdown both hands are shown;
 * otherwise it depends on the room setting.
 */
export function revealedSeats(state: HandState, revealAfterHand: boolean): PlayerIndex[] {
  if (!state.complete) return [];
  if (state.result?.wentToShowdown || revealAfterHand) return [0, 1];
  return [];
}

/** Strips the deck and every hole card the given seats are not allowed to see. */
export function toPublicState(state: HandState, options: PublicViewOptions = {}): PublicHandState {
  const reveal = new Set(options.reveal ?? []);
  const { deck: _deck, ...rest } = state;

  const players = state.players.map((player): PlayerState =>
    reveal.has(player.index) ? { ...player } : { ...player, holeCards: null },
  ) as [PlayerState, PlayerState];

  // The evaluated hands name the five cards that made them, hole cards included,
  // so they only travel when both seats are public.
  const bothRevealed = reveal.has(0) && reveal.has(1);
  const result =
    state.result && state.result.hands && !bothRevealed
      ? { ...state.result, hands: null }
      : state.result;

  return {
    ...rest,
    players,
    result,
    // Defensive: a showdown event carries cards, so drop any for a hidden seat.
    events: state.events.filter(
      (event: HandEvent) => event.kind !== 'show' || reveal.has(event.player),
    ),
    legal: legalActions(state),
  };
}

/** True when the public state contains no card a player should not have seen. */
export function isSafeToPublish(view: PublicHandState, reveal: readonly PlayerIndex[]): boolean {
  const allowed = new Set(reveal);
  if ('deck' in view) return false;
  for (const player of view.players) {
    if (player.holeCards !== null && !allowed.has(player.index)) return false;
  }
  if (view.result?.hands && !(allowed.has(0) && allowed.has(1))) return false;
  return view.events.every((event) => event.kind !== 'show' || allowed.has(event.player));
}
