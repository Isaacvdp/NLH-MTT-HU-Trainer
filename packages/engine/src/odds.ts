/**
 * Pot odds.
 *
 * Two questions come up at the table, and they are the same arithmetic pointed
 * in opposite directions:
 *
 *  - facing a bet: what share of the pot am I putting in to call, and so how
 *    often do I have to win to break even?
 *  - choosing a size: what share would my opponent be putting in, and so how
 *    often do they have to win to justify calling?
 */

import { legalActionsFor } from './actions.js';
import type { HandView, PlayerIndex } from './types.js';

export interface PotOdds {
  /** Chips the caller has to put in. */
  toCall: number;
  /** Chips in the middle before the call. */
  pot: number;
  /** Chips in the middle once the call is made. */
  potAfterCall: number;
  /**
   * Share of the final pot the call represents — the equity needed to break
   * even, as a fraction between 0 and 1.
   */
  equityNeeded: number;
  /** What the pot lays, so `3` means the caller is getting 3 to 1. */
  ratio: number;
}

/** Pot odds from a pot size and the price of calling. */
export function potOdds(pot: number, toCall: number): PotOdds {
  if (toCall <= 0) {
    return { toCall: 0, pot, potAfterCall: pot, equityNeeded: 0, ratio: Infinity };
  }
  const potAfterCall = pot + toCall;
  return {
    toCall,
    pot,
    potAfterCall,
    equityNeeded: toCall / potAfterCall,
    ratio: pot / toCall,
  };
}

/**
 * The price the player to act is being offered. `null` when there is nothing to
 * call, because then the question does not arise.
 */
export function oddsFacing(state: HandView, player: PlayerIndex): PotOdds | null {
  if (state.complete) return null;
  const legal = legalActionsFor(state, player);
  if (legal.callAmount <= 0) return null;
  return potOdds(state.pot, legal.callAmount);
}

/**
 * The price a bet or raise to `to` would offer the opponent. `null` when the
 * opponent has nothing left to call with, so no price is being laid.
 */
export function oddsLaid(state: HandView, player: PlayerIndex, to: number): PotOdds | null {
  if (state.complete) return null;
  const me = state.players[player];
  const opponent = state.players[player === 0 ? 1 : 0];
  if (opponent.status !== 'active') return null;

  const added = to - me.committedThisStreet;
  if (added <= 0) return null;

  // They can never be asked for more than they have behind.
  const theirCall = Math.min(to - opponent.committedThisStreet, opponent.stack);
  if (theirCall <= 0) return null;

  return potOdds(state.pot + added, theirCall);
}

/** `'27%'` — the equity needed, for display. */
export function formatEquity(odds: PotOdds): string {
  return `${Math.round(odds.equityNeeded * 100)}%`;
}

/** `'2.7 : 1'` — what the pot is laying, for display. */
export function formatRatio(odds: PotOdds): string {
  if (!Number.isFinite(odds.ratio)) return '—';
  const rounded = odds.ratio >= 10 ? Math.round(odds.ratio) : Number(odds.ratio.toFixed(1));
  return `${rounded} : 1`;
}
