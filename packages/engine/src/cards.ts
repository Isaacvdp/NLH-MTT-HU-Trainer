/**
 * Card primitives. Cards are plain strings (e.g. `'As'`, `'Td'`, `'7c'`) so that
 * they serialise straight into JSON columns / Realtime payloads with no mapping.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

/** Numeric value of a rank: 2..14 (ace high). */
export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const SUIT_NAMES: Record<Suit, string> = {
  c: 'clubs',
  d: 'diamonds',
  h: 'hearts',
  s: 'spades',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function rankValueOf(card: Card): number {
  return RANK_VALUE[rankOf(card)];
}

export function isCard(value: string): value is Card {
  return (
    value.length === 2 &&
    (RANKS as readonly string[]).includes(value[0]!) &&
    (SUITS as readonly string[]).includes(value[1]!)
  );
}

export function parseCard(value: string): Card {
  if (!isCard(value)) throw new Error(`Invalid card: ${value}`);
  return value;
}

/** Parses a whitespace- or comma-separated list of cards, e.g. `'As Kd 7c'`. */
export function parseCards(value: string): Card[] {
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseCard);
}

/** A fresh 52-card deck in a fixed, deterministic order. */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

/**
 * Random source used for shuffling: returns a uniformly distributed integer in
 * `[0, maxExclusive)`. Injectable so tests can be deterministic.
 */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Cryptographically secure `RandomInt` built on `crypto.getRandomValues`.
 * Uses rejection sampling so there is no modulo bias.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive: number): number => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return value % maxExclusive;
  }
};

/** Deterministic `RandomInt` for tests (mulberry32 PRNG). */
export function seededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive: number): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const float = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(float * maxExclusive);
  };
}

/** Fisher-Yates shuffle. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt = cryptoRandomInt): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = result[i]!;
    const b = result[j]!;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** A freshly shuffled 52-card deck. */
export function shuffledDeck(randomInt: RandomInt = cryptoRandomInt): Card[] {
  return shuffle(makeDeck(), randomInt);
}

export function formatCards(cards: readonly Card[]): string {
  return cards.join(' ');
}
