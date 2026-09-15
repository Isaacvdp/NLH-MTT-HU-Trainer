import { describe, expect, it } from 'vitest';
import { makeDeck, seededRandomInt, shuffledDeck, type Card } from './cards.js';
import {
  HAND_STRENGTH_ORDER,
  TOTAL_COMBOS,
  allHandClasses,
  classOf,
  combosIn,
  combosOf,
  gridCell,
  isHandClass,
} from './hands.js';
import {
  DEFAULT_POSITION_RANGES,
  defaultRangeFor,
  isAnyTwoCards,
  parseRange,
  parseRangeArray,
  rangeCombos,
  rangePercent,
  sampleFromRange,
  topPercentRange,
} from './range.js';
import { createHand } from './setup.js';
import type { Position } from './positions.js';
import type { SpotConfig } from './types.js';

describe('hand classes', () => {
  it('covers all 169 of them exactly once', () => {
    const classes = allHandClasses();
    expect(classes).toHaveLength(169);
    expect(new Set(classes).size).toBe(169);
  });

  it('adds up to every possible starting hand', () => {
    expect(allHandClasses().reduce((total, c) => total + combosOf(c), 0)).toBe(TOTAL_COMBOS);
  });

  it('lays the grid out with suited above the diagonal', () => {
    expect(gridCell(0, 0)).toBe('AA');
    expect(gridCell(0, 1)).toBe('AKs');
    expect(gridCell(1, 0)).toBe('AKo');
    expect(gridCell(12, 12)).toBe('22');
    expect(gridCell(0, 12)).toBe('A2s');
    expect(gridCell(12, 0)).toBe('A2o');
  });

  it('counts combinations per shape', () => {
    expect(combosOf('AA')).toBe(6);
    expect(combosOf('AKs')).toBe(4);
    expect(combosOf('AKo')).toBe(12);
    expect(combosIn('AA')).toHaveLength(6);
    expect(combosIn('AKs')).toHaveLength(4);
    expect(combosIn('AKo')).toHaveLength(12);
  });

  it('never builds a combination from one card twice', () => {
    for (const handClass of allHandClasses()) {
      for (const combo of combosIn(handClass)) {
        expect(combo[0]).not.toBe(combo[1]);
        expect(classOf(combo)).toBe(handClass);
      }
    }
  });

  it('reads a dealt hand back to its class', () => {
    expect(classOf(['As', 'Ad'])).toBe('AA');
    expect(classOf(['As', 'Ks'])).toBe('AKs');
    expect(classOf(['Ks', 'Ah'])).toBe('AKo');
    expect(classOf(['2c', '7d'])).toBe('72o');
  });

  it('rejects things that are not hand classes', () => {
    for (const value of ['', 'A', 'AKx', 'KAs', 'AAs', 'XXs', 'AKso']) {
      expect(isHandClass(value)).toBe(false);
    }
  });
});

describe('the strength order', () => {
  it('is every class, once', () => {
    expect(HAND_STRENGTH_ORDER).toHaveLength(169);
    expect(new Set(HAND_STRENGTH_ORDER)).toEqual(new Set(allHandClasses()));
  });

  it('starts and ends where you would expect', () => {
    expect(HAND_STRENGTH_ORDER.slice(0, 4)).toEqual(['AA', 'KK', 'QQ', 'JJ']);
    expect(HAND_STRENGTH_ORDER.at(-1)).toBe('72o');
  });
});

describe('parseRange', () => {
  it('reads single hands', () => {
    expect(parseRange('AA')).toEqual(['AA']);
    expect(parseRange('AKs, AKo')).toEqual(['AKs', 'AKo']);
  });

  it('reads pairs and up', () => {
    expect(parseRange('QQ+')).toEqual(['AA', 'KK', 'QQ']);
    expect(parseRange('22+')).toHaveLength(13);
  });

  it('reads suited and offsuit runs upwards', () => {
    expect(parseRange('ATs+')).toEqual(['AKs', 'AQs', 'AJs', 'ATs']);
    expect(parseRange('KTo+')).toEqual(['KQo', 'KJo', 'KTo']);
    expect(parseRange('A2s+')).toHaveLength(12);
  });

  it('reads explicit runs', () => {
    expect(parseRange('66-99')).toEqual(['99', '88', '77', '66']);
    expect(parseRange('99-66')).toEqual(['99', '88', '77', '66']);
    expect(new Set(parseRange('A2s-A5s'))).toEqual(new Set(['A5s', 'A4s', 'A3s', 'A2s']));
  });

  it('ignores stray whitespace and empty parts', () => {
    expect(parseRange('  AA ,, KK  ')).toEqual(['AA', 'KK']);
    expect(parseRange('')).toEqual([]);
  });

  it('drops duplicates and sorts by strength', () => {
    expect(parseRange('KK, AA, KK')).toEqual(['AA', 'KK']);
  });

  it('rejects nonsense', () => {
    expect(() => parseRange('XX')).toThrow(/Cannot read/);
    expect(() => parseRange('AKx')).toThrow(/Cannot read/);
    expect(() => parseRange('22-AKs')).toThrow(/mixes pairs/);
    expect(() => parseRange('A2s-K5s')).toThrow(/share a high card/);
  });
});

describe('range size', () => {
  it('counts combinations and percentages', () => {
    expect(rangeCombos(['AA'])).toBe(6);
    expect(rangeCombos(parseRange('22+'))).toBe(78);
    expect(rangePercent(parseRange('22+'))).toBeCloseTo((78 / 1326) * 100, 5);
    expect(rangePercent(allHandClasses())).toBe(100);
  });

  it('knows when a range is really any two cards', () => {
    expect(isAnyTwoCards([])).toBe(true);
    expect(isAnyTwoCards(allHandClasses())).toBe(true);
    expect(isAnyTwoCards(['AA'])).toBe(false);
  });
});

describe('topPercentRange', () => {
  it('lands on or just past the figure asked for', () => {
    for (const percent of [5, 10, 20, 35, 55, 80]) {
      const range = topPercentRange(percent);
      expect(rangePercent(range)).toBeGreaterThanOrEqual(percent);
      // Never overshoots by more than the single class that crossed the line.
      expect(rangePercent(range)).toBeLessThan(percent + 1);
    }
  });

  it('takes the strongest hands first', () => {
    // Aces alone are only 0.45% of hands, so 1% reaches down to queens.
    expect(topPercentRange(1)).toEqual(['AA', 'KK', 'QQ']);
    expect(topPercentRange(0)).toEqual([]);
    expect(topPercentRange(100)).toHaveLength(169);
    expect(topPercentRange(5)).toContain('AA');
    expect(topPercentRange(5)).not.toContain('72o');
  });

  it('refuses a negative percentage', () => {
    expect(() => topPercentRange(-1)).toThrow();
  });
});

describe('position presets', () => {
  it('has one for every seat and they all parse', () => {
    for (const position of Object.keys(DEFAULT_POSITION_RANGES) as Position[]) {
      expect(defaultRangeFor(position).length).toBeGreaterThan(0);
    }
  });

  it('opens wider the later the seat', () => {
    const percentOf = (position: Position): number => rangePercent(defaultRangeFor(position));
    const order: Position[] = ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN'];
    for (let i = 1; i < order.length; i++) {
      expect(percentOf(order[i]!)).toBeGreaterThan(percentOf(order[i - 1]!));
    }
  });

  it('puts the button somewhere near half of all hands', () => {
    const percent = rangePercent(defaultRangeFor('BTN'));
    expect(percent).toBeGreaterThan(40);
    expect(percent).toBeLessThan(60);
  });

  it('keeps the early seats tight', () => {
    expect(rangePercent(defaultRangeFor('UTG'))).toBeLessThan(20);
  });
});

describe('sampleFromRange', () => {
  const all = new Set<Card>(makeDeck());

  it('always returns a hand from the range', () => {
    const randomInt = seededRandomInt(11);
    const range = parseRange('AA, KK, AKs');
    for (let i = 0; i < 200; i++) {
      const hand = sampleFromRange(range, all, randomInt)!;
      expect(range).toContain(classOf(hand));
    }
  });

  it('reaches every combination in the range', () => {
    const randomInt = seededRandomInt(3);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      seen.add(sampleFromRange(['AA'], all, randomInt)!.join(''));
    }
    expect(seen.size).toBe(6);
  });

  it('only uses cards that are still available', () => {
    const randomInt = seededRandomInt(5);
    const available = new Set<Card>(makeDeck().filter((card) => card !== 'As' && card !== 'Ad'));
    for (let i = 0; i < 100; i++) {
      const hand = sampleFromRange(['AA'], available, randomInt)!;
      expect(hand).not.toContain('As');
      expect(hand).not.toContain('Ad');
    }
  });

  it('returns null when the range is blocked out', () => {
    const available = new Set<Card>(makeDeck().filter((card) => card[0] !== 'A'));
    expect(sampleFromRange(['AA'], available, seededRandomInt(1))).toBeNull();
  });

  it('parses and validates a stored range', () => {
    expect(parseRangeArray(['KK', 'AA'])).toEqual(['AA', 'KK']);
    expect(() => parseRangeArray('AA')).toThrow(/list of hands/);
    expect(() => parseRangeArray([1])).toThrow(/list of hands/);
    expect(() => parseRangeArray(['ZZ'])).toThrow(/is not a hand/);
  });
});

describe('dealing from ranges', () => {
  const spot = (overrides: Partial<SpotConfig> = {}): SpotConfig => ({
    tableSize: 9,
    smallBlind: 50,
    bigBlind: 100,
    anteType: 'none',
    ante: 0,
    positions: ['BTN', 'BB'],
    stacks: [10_000, 10_000],
    ...overrides,
  });

  it('deals each seat a hand from its own range', () => {
    const randomInt = seededRandomInt(2026);
    const ranges: [string[], string[]] = [parseRange('AA, KK'), parseRange('72o, 32o')];

    for (let i = 0; i < 100; i++) {
      const state = createHand(spot(), { deck: shuffledDeck(randomInt), randomInt, ranges });
      expect(ranges[0]).toContain(classOf(state.players[0].holeCards!));
      expect(ranges[1]).toContain(classOf(state.players[1].holeCards!));
    }
  });

  it('leaves a full board behind and never repeats a card', () => {
    const randomInt = seededRandomInt(9);
    const ranges: [string[], string[]] = [parseRange('22+'), parseRange('A2s+')];

    for (let i = 0; i < 50; i++) {
      const state = createHand(spot(), { deck: shuffledDeck(randomInt), randomInt, ranges });
      expect(state.deck).toHaveLength(48);
      const used = [...state.players[0].holeCards!, ...state.players[1].holeCards!];
      expect(new Set([...used, ...state.deck]).size).toBe(52);
    }
  });

  it('lets one seat keep any two cards', () => {
    const randomInt = seededRandomInt(4);
    const state = createHand(spot(), {
      deck: shuffledDeck(randomInt),
      randomInt,
      ranges: [parseRange('AA'), []],
    });
    expect(classOf(state.players[0].holeCards!)).toBe('AA');
    expect(state.players[1].holeCards).not.toBeNull();
  });

  it('copes with two narrow ranges that block each other', () => {
    const randomInt = seededRandomInt(77);
    // Both want aces, and there are only six ace combinations between them.
    for (let i = 0; i < 40; i++) {
      const state = createHand(spot(), {
        deck: shuffledDeck(randomInt),
        randomInt,
        ranges: [parseRange('AA'), parseRange('AA')],
      });
      expect(classOf(state.players[0].holeCards!)).toBe('AA');
      expect(classOf(state.players[1].holeCards!)).toBe('AA');
    }
  });

  it('says so plainly when a range holds nothing that can be dealt', () => {
    // Two players can always share any real range — aces against aces still
    // leaves a combination each — so this only happens with a short deck.
    const noAces = makeDeck().filter((card) => card[0] !== 'A');
    expect(() =>
      createHand(spot(), {
        deck: noAces,
        randomInt: seededRandomInt(1),
        ranges: [parseRange('AA'), []],
      }),
    ).toThrow(/no hands that can be dealt/);
  });

  it('shares a single class between both seats', () => {
    const randomInt = seededRandomInt(31);
    // Four suited combinations, one each, and they never collide.
    const state = createHand(spot(), {
      deck: shuffledDeck(randomInt),
      randomInt,
      ranges: [parseRange('AKs'), parseRange('AKs')],
    });
    const [a, b] = [state.players[0].holeCards!, state.players[1].holeCards!];
    expect(classOf(a)).toBe('AKs');
    expect(classOf(b)).toBe('AKs');
    expect(new Set([...a, ...b]).size).toBe(4);
  });

  it('deals off the top when neither seat has a range', () => {
    const state = createHand(spot(), { deck: makeDeck(), ranges: [[], []] });
    expect(state.players[0].holeCards).toEqual(['2c', '2d']);
    expect(state.players[1].holeCards).toEqual(['2h', '2s']);
  });
});
