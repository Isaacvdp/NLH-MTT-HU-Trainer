import { describe, expect, it } from 'vitest';
import {
  cryptoRandomInt,
  isCard,
  makeDeck,
  parseCards,
  rankOf,
  seededRandomInt,
  shuffle,
  shuffledDeck,
  suitOf,
} from './cards.js';

describe('deck', () => {
  it('builds 52 unique cards', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('parses and reads cards', () => {
    expect(rankOf('As')).toBe('A');
    expect(suitOf('As')).toBe('s');
    expect(parseCards('As Kd, 7c')).toEqual(['As', 'Kd', '7c']);
    expect(() => parseCards('Xx')).toThrow();
    expect(isCard('Th')).toBe(true);
    expect(isCard('1h')).toBe(false);
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate the input', () => {
    const deck = makeDeck();
    const shuffled = shuffle(deck, seededRandomInt(42));
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled)).toEqual(new Set(deck));
    expect(deck).toEqual(makeDeck());
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle(makeDeck(), seededRandomInt(7))).toEqual(shuffle(makeDeck(), seededRandomInt(7)));
    expect(shuffle(makeDeck(), seededRandomInt(7))).not.toEqual(shuffle(makeDeck(), seededRandomInt(8)));
  });

  it('reaches every position over many shuffles', () => {
    const randomInt = seededRandomInt(1);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      seen.add(makeDeck().indexOf(shuffle(makeDeck(), randomInt)[0]!));
    }
    // A fair shuffle should put many different cards on top.
    expect(seen.size).toBeGreaterThan(30);
  });

  it('shuffles with the crypto source by default', () => {
    const deck = shuffledDeck();
    expect(new Set(deck).size).toBe(52);
  });
});

describe('cryptoRandomInt', () => {
  it('stays in range and covers the whole range', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = cryptoRandomInt(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('always returns 0 for a range of one', () => {
    expect(cryptoRandomInt(1)).toBe(0);
  });

  it('rejects invalid ranges', () => {
    expect(() => cryptoRandomInt(0)).toThrow();
    expect(() => cryptoRandomInt(-3)).toThrow();
  });
});
