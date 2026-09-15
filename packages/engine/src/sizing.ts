/**
 * Bet-sizing helpers for the action bar: min, multipliers of the current bet,
 * fractions of the pot, and all-in. Every size is clamped to what is legal.
 */

import type { HandView, LegalActions } from './types.js';

export type SizingKind = 'min' | 'multiplier' | 'fraction' | 'pot' | 'all-in';

export interface SizingOption {
  label: string;
  /** Street total to bet or raise to. */
  to: number;
  /** Extra chips this costs the player. */
  amount: number;
  kind: SizingKind;
  /** `true` when this size puts the player all-in for the effective stack. */
  allIn: boolean;
}

/** Pot size once the player to act has called — the base for pot-fraction raises. */
export function potAfterCall(state: HandView, legal: LegalActions): number {
  return state.pot + legal.callAmount;
}

function clampTo(legal: LegalActions, opening: boolean, to: number): number {
  const min = opening ? legal.minBetTo : legal.minRaiseTo;
  return Math.max(min, Math.min(legal.maxTo, Math.round(to)));
}

/** Raise/bet total for `fraction` of the pot (0.5 = half pot). */
export function fractionOfPotTo(state: HandView, legal: LegalActions, fraction: number): number {
  const opening = state.currentBet === 0;
  const raw = opening
    ? state.pot * fraction
    : state.currentBet + potAfterCall(state, legal) * fraction;
  return clampTo(legal, opening, raw);
}

/** Raise total for a multiple of the current bet, e.g. a 2.5x preflop open. */
export function multipleOfBetTo(state: HandView, legal: LegalActions, multiple: number): number {
  const opening = state.currentBet === 0;
  const raw = opening ? state.config.bigBlind * multiple : state.currentBet * multiple;
  return clampTo(legal, opening, raw);
}

export const DEFAULT_POT_FRACTIONS = [0.33, 0.5, 0.75, 1] as const;
export const DEFAULT_PREFLOP_MULTIPLES = [2, 2.5, 3] as const;

function label(fraction: number): string {
  return fraction === 1 ? 'Pot' : `${Math.round(fraction * 100)}%`;
}

/**
 * The sizing buttons to show for the player to act. Returns an empty list when
 * the player cannot bet or raise. Duplicate sizes are collapsed.
 */
export function sizingOptions(state: HandView, legal: LegalActions): SizingOption[] {
  const opening = state.currentBet === 0;
  if (!legal.types.includes(opening ? 'bet' : 'raise')) return [];

  const options: SizingOption[] = [];
  const push = (label: string, to: number, kind: SizingKind): void => {
    if (options.some((option) => option.to === to)) return;
    options.push({
      label,
      to,
      amount: to - state.players[legal.player].committedThisStreet,
      kind,
      allIn: to === legal.maxTo,
    });
  };

  push('Min', opening ? legal.minBetTo : legal.minRaiseTo, 'min');

  if (state.street === 'preflop') {
    for (const multiple of DEFAULT_PREFLOP_MULTIPLES) {
      push(`${multiple}x`, multipleOfBetTo(state, legal, multiple), 'multiplier');
    }
  }
  for (const fraction of DEFAULT_POT_FRACTIONS) {
    push(label(fraction), fractionOfPotTo(state, legal, fraction), fraction === 1 ? 'pot' : 'fraction');
  }

  push('All-in', legal.maxTo, 'all-in');
  return options.sort((a, b) => a.to - b.to);
}

/** Formats a chip count in big blinds, e.g. `'12.5bb'`. */
export function toBigBlinds(chips: number, bigBlind: number, decimals = 1): string {
  const value = chips / bigBlind;
  const rounded = Number(value.toFixed(decimals));
  return `${rounded}bb`;
}
