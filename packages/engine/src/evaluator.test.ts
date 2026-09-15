import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.js';
import { compareHands, evaluateHand, type HandCategory } from './evaluator.js';

const evaluate = (cards: string) => evaluateHand(parseCards(cards));
const category = (cards: string): HandCategory => evaluate(cards).category;

describe('categories', () => {
  it.each([
    ['As Ks Qs Js Ts', 'straight-flush'],
    ['5s 4s 3s 2s As', 'straight-flush'],
    ['9h 9c 9d 9s 2c', 'four-of-a-kind'],
    ['8h 8c 8d 3s 3c', 'full-house'],
    ['Ah Th 7h 4h 2h', 'flush'],
    ['9h 8c 7d 6s 5c', 'straight'],
    ['Ah 2c 3d 4s 5c', 'straight'],
    ['Qh Qc Qd 8s 2c', 'three-of-a-kind'],
    ['Kh Kc 4d 4s 9c', 'two-pair'],
    ['Jh Jc 8d 5s 2c', 'pair'],
    ['Ah Jc 8d 5s 2c', 'high-card'],
  ] as const)('reads %s as %s', (cards, expected) => {
    expect(category(cards)).toBe(expected);
  });

  it('picks the best five out of seven', () => {
    expect(category('As Ks Qs Js Ts 2c 3d')).toBe('straight-flush');
    expect(category('2c 2d 2h 5s 5d 9c Kh')).toBe('full-house');
    // Two sets: the lower trips play as the pair.
    const twoSets = evaluate('7c 7d 7h 4s 4d 4c Kh');
    expect(twoSets.category).toBe('full-house');
    expect(twoSets.description).toBe('a full house, Sevens full of Fours');
  });

  it('does not build a straight flush from two different suits', () => {
    // Five hearts (flush) and a 9-high straight, but the straight needs the 5s.
    expect(category('9h 8h 7h 6h 2h 5s 3d')).toBe('flush');
    // Four to a straight flush plus a fifth card of another suit is just a straight.
    expect(category('9h 8h 7h 6h 5s 2c 3d')).toBe('straight');
  });

  it('finds a straight flush that is not the best flush cards', () => {
    // Ace-high flush is present, but 7-high straight flush is not the top five.
    const hand = evaluate('Ah 3h 4h 5h 6h 7h 2c');
    expect(hand.category).toBe('straight-flush');
    expect(hand.ranks[0]).toBe(7);
  });

  it('recognises a royal flush', () => {
    expect(evaluate('Ad Kd Qd Jd Td 2c 3s').description).toBe('a royal flush');
  });
});

describe('tiebreakers', () => {
  it('compares kickers', () => {
    expect(compareHands(evaluate('Ah Ac Kd 8s 2c'), evaluate('Ah Ac Qd 8s 2c'))).toBe(1);
    expect(compareHands(evaluate('Ah Ac Kd 8s 2c'), evaluate('Ah Ac Kd 8s 2c'))).toBe(0);
  });

  it('ranks the wheel below every other straight', () => {
    expect(compareHands(evaluate('Ah 2c 3d 4s 5c'), evaluate('2h 3c 4d 5s 6c'))).toBe(-1);
    expect(evaluate('Ah 2c 3d 4s 5c').description).toBe('a straight, Ace to Five');
    expect(evaluate('5s 4s 3s 2s As').description).toBe('a straight flush, Ace to Five');
  });

  it('ranks categories in the right order', () => {
    const ladder = [
      'Ah Jc 8d 5s 2c',
      'Jh Jc 8d 5s 2c',
      'Kh Kc 4d 4s 9c',
      'Qh Qc Qd 8s 2c',
      '9h 8c 7d 6s 5c',
      'Ah Th 7h 4h 2h',
      '8h 8c 8d 3s 3c',
      '9h 9c 9d 9s 2c',
      'As Ks Qs Js Ts',
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(compareHands(evaluate(ladder[i]!), evaluate(ladder[i - 1]!))).toBe(1);
    }
  });

  it('splits when the board plays', () => {
    const board = 'As Ks Qs Js Ts';
    expect(evaluateHand(parseCards(`2c 3d ${board}`)).value).toBe(
      evaluateHand(parseCards(`4h 5h ${board}`)).value,
    );
  });

  it('separates a flush from a higher flush of the same suit', () => {
    expect(compareHands(evaluate('Ah Qh 9h 5h 3h'), evaluate('Kh Qh 9h 5h 4h'))).toBe(1);
  });

  it('ranks full houses by the trips first', () => {
    expect(compareHands(evaluate('3c 3d 3h Ac Ad'), evaluate('2c 2d 2h Ac Ad Kh Kd'))).toBe(1);
  });
});

describe('descriptions', () => {
  it.each([
    ['Ah Ac Kd 8s 2c', 'a pair of Aces'],
    ['Kh Kc 4d 4s 9c', 'two pair, Kings and Fours'],
    ['Qh Qc Qd 8s 2c', 'three of a kind, Queens'],
    ['9h 8c 7d 6s 5c', 'a straight, Five to Nine'],
    ['Ah Th 7h 4h 2h', 'a flush, Ace high'],
    ['8h 8c 8d 3s 3c', 'a full house, Eights full of Threes'],
    ['9h 9c 9d 9s 2c', 'four of a kind, Nines'],
    ['9s 8s 7s 6s 5s', 'a straight flush, Five to Nine'],
    ['Ah Jc 8d 5s 2c', 'high card Ace'],
  ])('describes %s', (cards, expected) => {
    expect(evaluate(cards).description).toBe(expected);
  });
});

describe('validation', () => {
  it('rejects the wrong number of cards', () => {
    expect(() => evaluate('Ah Kh Qh Jh')).toThrow();
    expect(() => evaluate('Ah Kh Qh Jh Th 9h 8h 7h')).toThrow();
  });

  it('rejects duplicates', () => {
    expect(() => evaluate('Ah Ah Kh Qh Jh')).toThrow(/Duplicate/);
  });

  it('always returns exactly five cards', () => {
    for (const hand of ['Ah Ac Kd 8s 2c 3c 4d', '9h 8c 7d 6s 5c Ah Kh', 'Ah Th 7h 4h 2h 3c 3d']) {
      expect(evaluate(hand).cards).toHaveLength(5);
    }
  });
});
