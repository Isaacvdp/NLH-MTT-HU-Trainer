/**
 * Starting hands as the 169 classes everyone talks in: `AA`, `AKs`, `AKo`.
 *
 * A class is not a hand — it is a bucket of actual two-card combinations. Pairs
 * hold 6, suited hands 4 and offsuit hands 12, which is why "top 20% of hands"
 * has to be counted in combinations rather than in classes.
 */

import { RANKS, SUITS, type Card, type Rank, rankOf, suitOf } from './cards.js';

/** Ranks from ace down, which is the order the 13x13 grid is drawn in. */
export const RANKS_DESC: Rank[] = [...RANKS].reverse();

/** A starting hand class: `'AA'`, `'AKs'` or `'AKo'`. */
export type HandClass = string;

export const TOTAL_COMBOS = 1326;

function rankIndex(rank: Rank): number {
  return RANKS_DESC.indexOf(rank);
}

/** The class in a given cell of the 13x13 grid: suited above the diagonal. */
export function gridCell(row: number, column: number): HandClass {
  const high = RANKS_DESC[Math.min(row, column)]!;
  const low = RANKS_DESC[Math.max(row, column)]!;
  if (row === column) return `${high}${low}`;
  return `${high}${low}${row < column ? 's' : 'o'}`;
}

/** All 169 classes, in grid order (row by row from the ace corner). */
export function allHandClasses(): HandClass[] {
  const classes: HandClass[] = [];
  for (let row = 0; row < 13; row++) {
    for (let column = 0; column < 13; column++) {
      classes.push(gridCell(row, column));
    }
  }
  return classes;
}

export function isPair(handClass: HandClass): boolean {
  return handClass.length === 2;
}

export function isSuited(handClass: HandClass): boolean {
  return handClass.endsWith('s');
}

export function isHandClass(value: string): boolean {
  if (value.length < 2 || value.length > 3) return false;
  const high = value[0] as Rank;
  const low = value[1] as Rank;
  if (!RANKS_DESC.includes(high) || !RANKS_DESC.includes(low)) return false;

  if (value.length === 2) return high === low;
  if (high === low) return false;
  // The higher rank is always written first.
  if (rankIndex(high) > rankIndex(low)) return false;
  return value[2] === 's' || value[2] === 'o';
}

/** How many two-card combinations a class covers: 6, 4 or 12. */
export function combosOf(handClass: HandClass): number {
  if (isPair(handClass)) return 6;
  return isSuited(handClass) ? 4 : 12;
}

/** The class a dealt hand belongs to. */
export function classOf(cards: readonly [Card, Card]): HandClass {
  const [a, b] = cards;
  const rankA = rankOf(a);
  const rankB = rankOf(b);
  if (rankA === rankB) return `${rankA}${rankB}`;

  const [high, low] = rankIndex(rankA) < rankIndex(rankB) ? [rankA, rankB] : [rankB, rankA];
  return `${high}${low}${suitOf(a) === suitOf(b) ? 's' : 'o'}`;
}

/** Every actual two-card combination in a class. */
export function combosIn(handClass: HandClass): [Card, Card][] {
  const high = handClass[0] as Rank;
  const low = handClass[1] as Rank;
  const combos: [Card, Card][] = [];

  if (isPair(handClass)) {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([`${high}${SUITS[i]!}`, `${high}${SUITS[j]!}`]);
      }
    }
    return combos;
  }

  if (isSuited(handClass)) {
    for (const suit of SUITS) combos.push([`${high}${suit}`, `${low}${suit}`]);
    return combos;
  }

  for (const highSuit of SUITS) {
    for (const lowSuit of SUITS) {
      if (highSuit !== lowSuit) combos.push([`${high}${highSuit}`, `${low}${lowSuit}`]);
    }
  }
  return combos;
}

/**
 * The 169 classes from strongest to weakest, by all-in equity against a random
 * hand. Used for "top N%" and nothing else — real ranges are not shaped like
 * this list, which is why the presets are written out as ranges instead.
 */
export const HAND_STRENGTH_ORDER: HandClass[] = [
  'AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'TT', 'AKo', 'AJs', 'KQs',
  '99', 'ATs', 'AQo', 'KJs', '88', 'QJs', 'KTs', 'A9s', 'AJo', 'QTs',
  'KQo', '77', 'JTs', 'A8s', 'K9s', 'A7s', 'A5s', 'Q9s', 'ATo', 'A6s',
  'A4s', '66', 'KJo', 'A3s', 'QJo', 'J9s', 'K8s', 'A2s', 'T9s', 'KTo',
  '55', 'JTo', 'K7s', 'Q8s', 'K6s', 'A9o', 'K5s', '98s', 'Q7s', 'J8s',
  'QTo', 'K4s', '44', 'T8s', 'Q6s', 'A8o', 'K3s', '87s', 'J7s', 'Q5s',
  'K2s', '97s', 'A7o', '33', 'T7s', 'Q4s', 'A5o', 'K9o', '76s', 'J9o',
  '86s', 'Q3s', 'A6o', '22', 'T9o', '96s', 'J6s', 'Q2s', '65s', 'A4o',
  'K8o', 'J5s', '75s', 'T6s', '98o', 'A3o', 'Q9o', 'J4s', '85s', 'K7o',
  '54s', 'J3s', 'A2o', '64s', 'T8o', '95s', 'J2s', 'T5s', 'K6o', '87o',
  '74s', 'Q8o', '53s', '84s', 'T4s', '97o', 'K5o', '63s', 'J8o', 'T3s',
  '43s', '94s', '76o', 'T2s', '52s', 'K4o', '86o', 'Q7o', '73s', '96o',
  '62s', '42s', 'K3o', 'J7o', '93s', '65o', '32s', '83s', 'T7o', 'K2o',
  'Q6o', '92s', '54o', '75o', '82s', 'J6o', 'Q5o', '85o', '64o', 'T6o',
  '72s', 'J5o', '95o', 'Q4o', '43o', '53o', 'Q3o', '74o', 'J4o', 'T5o',
  '84o', '63o', 'Q2o', '94o', 'J3o', '52o', '73o', 'T4o', '42o', 'J2o',
  '83o', '62o', 'T3o', '93o', '32o', '92o', 'T2o', '82o', '72o',
];
