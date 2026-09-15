/**
 * Preflop ranges: which starting hands a seat is dealt.
 *
 * A range is just the set of hand classes in it, so it serialises as an array
 * of short strings and a grid cell is either on or off. Mixed frequencies are
 * deliberately not modelled yet.
 */

import type { Card, RandomInt } from './cards.js';
import {
  HAND_STRENGTH_ORDER,
  RANKS_DESC,
  TOTAL_COMBOS,
  combosIn,
  combosOf,
  isHandClass,
  isPair,
  type HandClass,
} from './hands.js';
import type { Position } from './positions.js';

/** The hand classes a seat can be dealt. Empty means any two cards. */
export type Range = HandClass[];

export class RangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RangeError';
  }
}

function rankIndex(rank: string): number {
  return RANKS_DESC.indexOf(rank as never);
}

export function rangeCombos(range: Range): number {
  return range.reduce((total, handClass) => total + combosOf(handClass), 0);
}

/** What share of all starting hands the range covers, as a percentage. */
export function rangePercent(range: Range): number {
  return (rangeCombos(range) / TOTAL_COMBOS) * 100;
}

/** Sorts a range into grid order and drops duplicates. */
export function normalizeRange(range: Range): Range {
  const seen = new Set<HandClass>();
  for (const handClass of range) {
    if (!isHandClass(handClass)) throw new RangeError(`${handClass} is not a hand`);
    seen.add(handClass);
  }
  return HAND_STRENGTH_ORDER.filter((handClass) => seen.has(handClass));
}

/** Validates unknown JSON into a range. */
export function parseRangeArray(input: unknown): Range {
  if (!Array.isArray(input)) throw new RangeError('A range must be a list of hands');
  if (input.length > 169) throw new RangeError('A range cannot hold more than 169 hands');
  return normalizeRange(
    input.map((value) => {
      if (typeof value !== 'string') throw new RangeError('A range must be a list of hands');
      return value;
    }),
  );
}

/**
 * Reads the usual shorthand: `'22+, A2s+, KTo+, 54s-76s, AKo'`.
 *  - `77+`   every pair from sevens up
 *  - `A2s+`  every suited ace from A2s to AKs
 *  - `KTo+`  KTo, KJo, KQo
 *  - `66-99` an explicit run
 */
export function parseRange(notation: string): Range {
  const out = new Set<HandClass>();

  for (const rawPart of notation.split(',')) {
    const part = rawPart.trim();
    if (part === '') continue;

    if (part.includes('-')) {
      const [from, to] = part.split('-').map((piece) => piece.trim());
      if (!from || !to) throw new RangeError(`Cannot read "${part}"`);
      for (const handClass of runBetween(from, to)) out.add(handClass);
      continue;
    }

    if (part.endsWith('+')) {
      for (const handClass of runUpwards(part.slice(0, -1))) out.add(handClass);
      continue;
    }

    if (!isHandClass(part)) throw new RangeError(`Cannot read "${part}"`);
    out.add(part);
  }

  return normalizeRange([...out]);
}

/** Every class between two of the same shape, e.g. `66` to `99`, `A2s` to `A5s`. */
function runBetween(from: HandClass, to: HandClass): HandClass[] {
  if (!isHandClass(from) || !isHandClass(to)) throw new RangeError(`Cannot read "${from}-${to}"`);

  if (isPair(from) !== isPair(to)) throw new RangeError(`"${from}-${to}" mixes pairs and non-pairs`);

  if (isPair(from)) {
    const [a, b] = [rankIndex(from[0]!), rankIndex(to[0]!)].sort((x, y) => x - y);
    return RANKS_DESC.slice(a, b! + 1).map((rank) => `${rank}${rank}`);
  }

  if (from[0] !== to[0] || from[2] !== to[2]) {
    throw new RangeError(`"${from}-${to}" must share a high card and a suitedness`);
  }
  const high = from[0]!;
  const suffix = from[2]!;
  const [a, b] = [rankIndex(from[1]!), rankIndex(to[1]!)].sort((x, y) => x - y);
  return RANKS_DESC.slice(a, b! + 1)
    .filter((rank) => rankIndex(rank) > rankIndex(high))
    .map((rank) => `${high}${rank}${suffix}`);
}

/** `77+` upwards to aces, `A2s+` upwards to AKs. */
function runUpwards(base: HandClass): HandClass[] {
  if (!isHandClass(base)) throw new RangeError(`Cannot read "${base}+"`);

  if (isPair(base)) {
    return RANKS_DESC.slice(0, rankIndex(base[0]!) + 1).map((rank) => `${rank}${rank}`);
  }

  const high = base[0]!;
  const suffix = base[2]!;
  // Climb the low card up to, but not including, the high card.
  return RANKS_DESC.slice(rankIndex(high) + 1, rankIndex(base[1]!) + 1).map(
    (rank) => `${high}${rank}${suffix}`,
  );
}

/**
 * The strongest hands making up roughly `percent` of all starting hands, by
 * equity against a random hand. Whole classes only, so the result lands on or
 * just past the figure asked for.
 */
export function topPercentRange(percent: number): Range {
  if (!Number.isFinite(percent) || percent < 0) throw new RangeError('Percent must be 0 or more');
  const target = (Math.min(percent, 100) / 100) * TOTAL_COMBOS;

  const range: Range = [];
  let combos = 0;
  for (const handClass of HAND_STRENGTH_ORDER) {
    if (combos >= target) break;
    range.push(handClass);
    combos += combosOf(handClass);
  }
  return range;
}

/**
 * Picks one combination from the range, using only cards that are still
 * available. Returns `null` when the range is blocked out entirely.
 */
export function sampleFromRange(
  range: Range,
  available: ReadonlySet<Card>,
  randomInt: RandomInt,
): [Card, Card] | null {
  const combos: [Card, Card][] = [];
  for (const handClass of range) {
    for (const combo of combosIn(handClass)) {
      if (available.has(combo[0]) && available.has(combo[1])) combos.push(combo);
    }
  }
  if (combos.length === 0) return null;
  return combos[randomInt(combos.length)]!;
}

/** True when the range places no restriction on what can be dealt. */
export function isAnyTwoCards(range: Range): boolean {
  return range.length === 0 || range.length === 169;
}

/**
 * Opening ranges by seat, roughly the shape a solver gives for a mid-stack
 * multi-table tournament. They are hand-written approximations meant as a
 * sensible starting point, not exports from any particular solver — edit them
 * in the grid to taste.
 */
export const DEFAULT_POSITION_RANGES: Record<Position, string> = {
  UTG: '22+, A2s+, KTs+, QTs+, JTs, T9s, 98s, ATo+, KQo',
  UTG1: '22+, A2s+, K9s+, QTs+, JTs, T9s, 98s, 87s, ATo+, KJo+',
  UTG2: '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, ATo+, KJo+',
  LJ: '22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, A9o+, KTo+, QJo',
  HJ: '22+, A2s+, K8s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A9o+, KTo+, QJo',
  CO: '22+, A2s+, K7s+, Q8s+, J8s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A8o+, K9o+, QTo+, JTo',
  BTN: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K7o+, Q9o+, J9o+, T9o',
  SB: '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A5o+, K9o+, QTo+, JTo',
  BB: '22+, A2s+, K2s+, Q2s+, J4s+, T5s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q8o+, J8o+, T8o, 98o',
};

export function defaultRangeFor(position: Position): Range {
  return parseRange(DEFAULT_POSITION_RANGES[position]);
}
