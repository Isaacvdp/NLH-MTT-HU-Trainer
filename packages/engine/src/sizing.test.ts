import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './actions.js';
import { makeDeck } from './cards.js';
import { createHand } from './setup.js';
import { fractionOfPotTo, multipleOfBetTo, potAfterCall, sizingOptions, toBigBlinds } from './sizing.js';
import type { Action, HandState, SpotConfig } from './types.js';

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

const hand = (overrides: Partial<SpotConfig> = {}) => createHand(spot(overrides), { deck: makeDeck() });
const play = (state: HandState, ...actions: Action[]): HandState =>
  actions.reduce((current, action) => applyAction(current, action), state);

const sizes = (state: HandState) => sizingOptions(state, legalActions(state)!);

describe('preflop sizing', () => {
  it('offers multipliers of the big blind and pot fractions', () => {
    const state = hand();
    const legal = legalActions(state)!;
    expect(potAfterCall(state, legal)).toBe(250);
    expect(multipleOfBetTo(state, legal, 2)).toBe(200);
    expect(multipleOfBetTo(state, legal, 2.5)).toBe(250);
    expect(multipleOfBetTo(state, legal, 3)).toBe(300);
    // A raise to the pot: call 100, then raise the 250 that is then in the middle.
    expect(fractionOfPotTo(state, legal, 1)).toBe(350);
    expect(fractionOfPotTo(state, legal, 0.5)).toBe(225);
  });

  it('clamps sizes below the minimum raise up to the minimum', () => {
    const state = hand();
    const legal = legalActions(state)!;
    // A third of the pot would be a raise to 183, below the 200 minimum.
    expect(fractionOfPotTo(state, legal, 0.33)).toBe(200);
  });

  it('clamps sizes above the effective stack down to all-in', () => {
    // A pot-sized raise would be to 350, but the big blind only has 300.
    const state = hand({ stacks: [10_000, 300] });
    const legal = legalActions(state)!;
    expect(legal.maxTo).toBe(300);
    expect(fractionOfPotTo(state, legal, 1)).toBe(300);
    expect(multipleOfBetTo(state, legal, 3)).toBe(300);
  });

  it('sorts buttons by size, drops duplicates and ends with all-in', () => {
    const options = sizes(hand());
    expect(options.map((option) => option.to)).toEqual([200, 250, 300, 225, 288, 350, 10_000].sort((a, b) => a - b));
    expect(options[0]!.label).toBe('Min');
    expect(options.at(-1)!).toMatchObject({ label: 'All-in', to: 10_000, allIn: true });
    expect(new Set(options.map((option) => option.to)).size).toBe(options.length);
  });

  it('reports what each size costs the player', () => {
    const state = play(hand(), { type: 'raise', to: 300 });
    const options = sizes(state);
    const min = options.find((option) => option.label === 'Min')!;
    // The open was 200 over the blind, so the minimum re-raise is to 500.
    expect(min.to).toBe(500);
    // The big blind already has 100 in, so that costs 400 more.
    expect(min.amount).toBe(400);
  });
});

describe('postflop sizing', () => {
  it('uses fractions of the pot with no multipliers', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.pot).toBe(250);
    const options = sizes(state);
    expect(options.map((option) => [option.label, option.to])).toEqual([
      ['Min', 100],
      ['50%', 125],
      ['75%', 188],
      ['Pot', 250],
      ['All-in', 9_900],
    ]);
  });

  it('is empty when the player cannot bet or raise', () => {
    // Facing an all-in there is nothing to size.
    const state = play(hand({ stacks: [10_000, 400] }), { type: 'raise', to: 300 }, { type: 'all-in' });
    expect(sizes(state)).toEqual([]);
  });
});

describe('big blind formatting', () => {
  it('converts chips to big blinds', () => {
    expect(toBigBlinds(2_500, 100)).toBe('25bb');
    expect(toBigBlinds(1_250, 100)).toBe('12.5bb');
    expect(toBigBlinds(1_233, 100)).toBe('12.3bb');
    expect(toBigBlinds(1_233, 100, 2)).toBe('12.33bb');
  });
});
