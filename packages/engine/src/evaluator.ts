/**
 * Five-to-seven card hand evaluator.
 *
 * Produces a `HandValue` whose `value` is a single comparable integer, so hands
 * can be stored and compared without re-deriving the ranking.
 */

import { RANK_VALUE, type Card, rankValueOf, suitOf, type Suit } from './cards.js';

export const HAND_CATEGORIES = [
  'high-card',
  'pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export interface HandValue {
  /** Category name, e.g. `'two-pair'`. */
  category: HandCategory;
  /** Category index 0..8; higher is better. */
  categoryRank: number;
  /** Up to five tiebreaker rank values, most significant first. */
  ranks: number[];
  /** Single comparable integer; higher is better. */
  value: number;
  /** The best five cards, strongest first. */
  cards: Card[];
  /** Human readable, PokerStars-ish: `'two pair, Aces and Kings'`. */
  description: string;
}

const RANK_SINGULAR: Record<number, string> = {
  2: 'Deuce',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

const RANK_PLURAL: Record<number, string> = {
  2: 'Deuces',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};

export function rankName(value: number): string {
  return RANK_SINGULAR[value] ?? String(value);
}

export function rankNamePlural(value: number): string {
  return RANK_PLURAL[value] ?? String(value);
}

const RANK_BASE = 15;

function packValue(categoryRank: number, ranks: number[]): number {
  let value = categoryRank;
  for (let i = 0; i < 5; i++) {
    value = value * RANK_BASE + (ranks[i] ?? 0);
  }
  return value;
}

/** Highest card of a straight within `values` (distinct, sorted desc), or 0. */
function straightHigh(values: number[]): number {
  const present = new Set(values);
  for (let high = 14; high >= 5; high--) {
    if (present.has(high) && present.has(high - 1) && present.has(high - 2) && present.has(high - 3) && present.has(high - 4)) {
      return high;
    }
  }
  // Wheel: A-2-3-4-5, ranked as a five-high straight.
  if (present.has(14) && present.has(2) && present.has(3) && present.has(4) && present.has(5)) {
    return 5;
  }
  return 0;
}

function cardsWithValues(cards: readonly Card[], wanted: number[], suit?: Suit): Card[] {
  const picked: Card[] = [];
  for (const want of wanted) {
    const card = cards.find(
      (c) => rankValueOf(c) === want && (suit === undefined || suitOf(c) === suit) && !picked.includes(c),
    );
    if (card) picked.push(card);
  }
  return picked;
}

function straightCardValues(high: number): number[] {
  if (high === 5) return [5, 4, 3, 2, 14];
  return [high, high - 1, high - 2, high - 3, high - 4];
}

/** Low end of a straight, treating the wheel as ace-to-five. */
function straightLow(high: number): number {
  return high === 5 ? 14 : high - 4;
}

/**
 * Evaluates the best five-card hand out of 5, 6 or 7 cards.
 * Throws on duplicate cards or an out-of-range count.
 */
export function evaluateHand(input: readonly Card[]): HandValue {
  if (input.length < 5 || input.length > 7) {
    throw new Error(`Expected 5-7 cards to evaluate, got ${input.length}`);
  }
  if (new Set(input).size !== input.length) {
    throw new Error(`Duplicate cards: ${input.join(' ')}`);
  }
  const cards = input.slice().sort((a, b) => rankValueOf(b) - rankValueOf(a));
  const values = cards.map(rankValueOf);

  const byRank = new Map<number, number>();
  for (const value of values) byRank.set(value, (byRank.get(value) ?? 0) + 1);

  const bySuit = new Map<Suit, Card[]>();
  for (const card of cards) {
    const list = bySuit.get(suitOf(card)) ?? [];
    list.push(card);
    bySuit.set(suitOf(card), list);
  }

  let flushSuit: Suit | undefined;
  for (const [suit, list] of bySuit) {
    if (list.length >= 5) flushSuit = suit;
  }

  const distinct = [...byRank.keys()].sort((a, b) => b - a);

  // Straight flush
  if (flushSuit) {
    const flushCards = bySuit.get(flushSuit)!;
    const flushValues = flushCards.map(rankValueOf);
    const high = straightHigh([...new Set(flushValues)].sort((a, b) => b - a));
    if (high > 0) {
      const picked = cardsWithValues(flushCards, straightCardValues(high), flushSuit);
      return build('straight-flush', [high], picked, high === 14
        ? 'a royal flush'
        : `a straight flush, ${rankName(straightLow(high))} to ${rankName(high)}`);
    }
  }

  const quads = distinct.filter((v) => byRank.get(v) === 4);
  const trips = distinct.filter((v) => byRank.get(v) === 3);
  const pairs = distinct.filter((v) => byRank.get(v) === 2);

  // Four of a kind
  if (quads.length > 0) {
    const quad = quads[0]!;
    const kicker = distinct.find((v) => v !== quad)!;
    const picked = [...cardsWithValues(cards, [quad, quad, quad, quad]), ...cardsWithValues(cards, [kicker])];
    return build('four-of-a-kind', [quad, kicker], picked, `four of a kind, ${rankNamePlural(quad)}`);
  }

  // Full house (a second set of trips plays as the pair)
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const three = trips[0]!;
    const two = trips.length > 1 ? Math.max(trips[1]!, pairs[0] ?? 0) : pairs[0]!;
    const picked = [...cardsWithValues(cards, [three, three, three]), ...cardsWithValues(cards, [two, two])];
    return build(
      'full-house',
      [three, two],
      picked,
      `a full house, ${rankNamePlural(three)} full of ${rankNamePlural(two)}`,
    );
  }

  // Flush
  if (flushSuit) {
    const flushCards = bySuit.get(flushSuit)!.slice(0, 5);
    const ranks = flushCards.map(rankValueOf);
    return build('flush', ranks, flushCards, `a flush, ${rankName(ranks[0]!)} high`);
  }

  // Straight
  const high = straightHigh(distinct);
  if (high > 0) {
    const picked = cardsWithValues(cards, straightCardValues(high));
    return build('straight', [high], picked, `a straight, ${rankName(straightLow(high))} to ${rankName(high)}`);
  }

  // Three of a kind
  if (trips.length > 0) {
    const three = trips[0]!;
    const kickers = distinct.filter((v) => v !== three).slice(0, 2);
    const picked = [...cardsWithValues(cards, [three, three, three]), ...cardsWithValues(cards, kickers)];
    return build(
      'three-of-a-kind',
      [three, ...kickers],
      picked,
      `three of a kind, ${rankNamePlural(three)}`,
    );
  }

  // Two pair
  if (pairs.length >= 2) {
    const [hi, lo] = [pairs[0]!, pairs[1]!];
    const kicker = distinct.find((v) => v !== hi && v !== lo)!;
    const picked = [
      ...cardsWithValues(cards, [hi, hi]),
      ...cardsWithValues(cards, [lo, lo]),
      ...cardsWithValues(cards, [kicker]),
    ];
    return build(
      'two-pair',
      [hi, lo, kicker],
      picked,
      `two pair, ${rankNamePlural(hi)} and ${rankNamePlural(lo)}`,
    );
  }

  // One pair
  if (pairs.length === 1) {
    const pair = pairs[0]!;
    const kickers = distinct.filter((v) => v !== pair).slice(0, 3);
    const picked = [...cardsWithValues(cards, [pair, pair]), ...cardsWithValues(cards, kickers)];
    return build('pair', [pair, ...kickers], picked, `a pair of ${rankNamePlural(pair)}`);
  }

  // High card
  const top = distinct.slice(0, 5);
  return build('high-card', top, cardsWithValues(cards, top), `high card ${rankName(top[0]!)}`);
}

function build(category: HandCategory, ranks: number[], cards: Card[], description: string): HandValue {
  return {
    category,
    categoryRank: HAND_CATEGORIES.indexOf(category),
    ranks,
    value: packValue(HAND_CATEGORIES.indexOf(category), ranks),
    cards,
    description,
  };
}

/** `-1` if `a` loses, `0` on a tie, `1` if `a` wins. */
export function compareHands(a: HandValue, b: HandValue): number {
  return Math.sign(a.value - b.value);
}

export { RANK_VALUE };
