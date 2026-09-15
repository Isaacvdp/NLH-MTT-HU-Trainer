import { describe, expect, it } from 'vitest';
import { seededRandomInt } from './cards.js';
import {
  DEFAULT_ROOM_SETTINGS,
  configForSettings,
  nextSeatOf,
  parseRoomSettings,
  stacksForNextHand,
  startingStackFor,
  type RoomSettings,
} from './room.js';

const settings = (overrides: Partial<RoomSettings> = {}): RoomSettings => ({
  ...DEFAULT_ROOM_SETTINGS,
  ...overrides,
});

const parse = (overrides: Record<string, unknown> = {}) =>
  parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, ...overrides });

describe('parseRoomSettings', () => {
  it('accepts the defaults and returns them unchanged', () => {
    expect(parse()).toEqual(DEFAULT_ROOM_SETTINGS);
  });

  it('rejects anything that is not an object', () => {
    for (const value of [null, 'settings', 42, [], undefined]) {
      expect(() => parseRoomSettings(value)).toThrow(/must be an object/);
    }
  });

  it('rejects seats that do not exist at the table size', () => {
    expect(() => parse({ tableSize: 5, positions: ['UTG', 'BB'] })).toThrow(/not a seat/);
    expect(() => parse({ positions: ['BTN', 'BTN'] })).toThrow(/must be different/);
    expect(() => parse({ positions: ['BTN'] })).toThrow(/two seats/);
    expect(() => parse({ positions: 'BTN vs BB' })).toThrow(/two seats/);
  });

  it('rejects table sizes outside 2 to 9', () => {
    expect(() => parse({ tableSize: 1 })).toThrow(/between 2 and 9/);
    expect(() => parse({ tableSize: 10 })).toThrow(/between 2 and 9/);
    expect(() => parse({ tableSize: 6.5 })).toThrow(/whole number/);
  });

  it('rejects blinds that make no sense', () => {
    expect(() => parse({ bigBlind: 0 })).toThrow();
    expect(() => parse({ bigBlind: 100, smallBlind: 200 })).toThrow(/between 0 and 100/);
    expect(() => parse({ bigBlind: 1e12 })).toThrow();
  });

  it('zeroes the ante when there is no ante', () => {
    expect(parse({ anteType: 'none', ante: 250 }).ante).toBe(0);
  });

  it('requires a positive ante when one is configured', () => {
    expect(() => parse({ anteType: 'per-player', ante: 0 })).toThrow(/between 1/);
  });

  it('rejects an inverted stack range', () => {
    expect(() => parse({ minStackBb: 60, maxStackBb: 15 })).toThrow(/not be larger/);
  });

  it('rejects non-boolean toggles', () => {
    expect(() => parse({ carryStacksOver: 'yes' })).toThrow(/true or false/);
    expect(() => parse({ swapSeatsEachHand: 1 })).toThrow(/true or false/);
  });

  it('rejects an unknown ante type or stack mode', () => {
    expect(() => parse({ anteType: 'straddle' })).toThrow(/one of/);
    expect(() => parse({ stackMode: 'deep' })).toThrow(/one of/);
  });

  it('cleans up player names', () => {
    expect(parse({ playerNames: ['  Isaac  ', ''] }).playerNames).toEqual(['Isaac', 'Player 2']);
    expect(parse({ playerNames: [] }).playerNames).toEqual(['Player 1', 'Player 2']);
    expect(parse({ playerNames: ['x'.repeat(200), 'y'] }).playerNames[0]).toHaveLength(40);
    expect(() => parse({ playerNames: [42, 'y'] })).toThrow(/must be text/);
  });

  it('drops fields it was not asked for', () => {
    const parsed = parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, isAdmin: true, stacks: [1, 1] });
    expect('isAdmin' in parsed).toBe(false);
    expect('stacks' in parsed).toBe(false);
  });
});

describe('configForSettings', () => {
  it('builds a spot config the engine accepts', () => {
    const config = configForSettings(settings(), [4_000, 4_000]);
    expect(config).toEqual({
      tableSize: 9,
      smallBlind: 50,
      bigBlind: 100,
      anteType: 'bb',
      ante: 100,
      positions: ['BTN', 'BB'],
      stacks: [4_000, 4_000],
    });
  });
});

describe('stacks', () => {
  it('uses a fixed stack when asked to', () => {
    expect(startingStackFor(settings({ stackBb: 25 }), seededRandomInt(1))).toBe(2_500);
  });

  it('draws inside the range when random', () => {
    const random = seededRandomInt(3);
    const config = settings({ stackMode: 'random', minStackBb: 15, maxStackBb: 60 });
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const stack = startingStackFor(config, random);
      expect(stack).toBeGreaterThanOrEqual(1_500);
      expect(stack).toBeLessThanOrEqual(6_000);
      seen.add(stack);
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('resets every hand unless stacks carry over', () => {
    const random = seededRandomInt(5);
    const fresh = stacksForNextHand(settings({ stackBb: 40 }), [0, 1], [123, 456], random, false);
    expect(fresh).toEqual([4_000, 4_000]);
  });

  it('carries stacks over, mapping people to the seats they now sit in', () => {
    const random = seededRandomInt(5);
    const config = settings({ carryStacksOver: true });
    // Person 1 is in seat 0 after a swap, so their 456 goes to seat 0.
    expect(stacksForNextHand(config, [1, 0], [123, 456], random, false)).toEqual([456, 123]);
    // The first hand always deals fresh stacks.
    expect(stacksForNextHand(config, [1, 0], [123, 456], random, true)).toEqual([4_000, 4_000]);
  });
});

describe('nextSeatOf', () => {
  it('swaps when the room says to', () => {
    expect(nextSeatOf([0, 1], settings({ swapSeatsEachHand: true }))).toEqual([1, 0]);
    expect(nextSeatOf([1, 0], settings({ swapSeatsEachHand: true }))).toEqual([0, 1]);
  });

  it('leaves seating alone otherwise', () => {
    expect(nextSeatOf([1, 0], settings({ swapSeatsEachHand: false }))).toEqual([1, 0]);
  });
});
