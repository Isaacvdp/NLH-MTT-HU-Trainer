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
    // A quarter of the pot would be a raise to 163, below the 200 minimum.
    expect(fractionOfPotTo(state, legal, 0.25)).toBe(200);
  });

  it('clamps sizes above the effective stack down to all-in', () => {
    // A pot-sized raise would be to 350, but the big blind only has 300.
    const state = hand({ stacks: [10_000, 300] });
    const legal = legalActions(state)!;
    expect(legal.maxTo).toBe(300);
    expect(fractionOfPotTo(state, legal, 1)).toBe(300);
    expect(multipleOfBetTo(state, legal, 3)).toBe(300);
  });

  it('shows only multiples of the bet, sorted, with no pot fractions', () => {
    const options = sizes(hand());
    expect(options.map((option) => [option.label, option.to])).toEqual([
      ['2x', 200],
      ['2.2x', 220],
      ['2.5x', 250],
      ['3x', 300],
    ]);
    // The minimum and the all-in belong to the slider, not to these buttons.
    expect(options.some((option) => option.label === 'Min' || option.label === 'All-in')).toBe(false);
  });

  it('reports what each size costs the player', () => {
    const state = play(hand(), { type: 'raise', to: 300 });
    const options = sizes(state);
    // Facing a raise to 300, a 3x re-raise is to 900.
    const threeX = options.find((option) => option.label === '3x')!;
    expect(threeX.to).toBe(900);
    // The big blind already has 100 in, so that costs 800 more.
    expect(threeX.amount).toBe(800);
  });

  it('drops the multiples the stack cannot reach', () => {
    // The big blind has 250, so 3x is capped onto 2.5x and the pair collapse.
    expect(sizes(hand({ stacks: [10_000, 250] })).map((option) => option.to)).toEqual([200, 220, 250]);
  });

  it('collapses to a single all-in once every multiple is out of reach', () => {
    const options = sizes(hand({ stacks: [10_000, 150] }));
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ to: 150, allIn: true });
  });
});

describe('postflop sizing', () => {
  it('uses fractions of the pot with no multipliers', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.pot).toBe(250);
    const options = sizes(state);
    // A quarter of 250 is below the 100 minimum bet, so it lands on the minimum
    // and is then the same size as 40%.
    expect(options.map((option) => [option.label, option.to])).toEqual([
      ['25%', 100],
      ['66%', 165],
      ['100%', 250],
    ]);
    expect(options.some((option) => option.label.endsWith('x'))).toBe(false);
  });

  it('keeps all four fractions apart once the pot is big enough', () => {
    const state = play(hand(), { type: 'raise', to: 1_000 }, { type: 'call' });
    expect(state.pot).toBe(2_050);
    expect(sizes(state).map((option) => [option.label, option.to])).toEqual([
      ['25%', 513],
      ['40%', 820],
      ['66%', 1_353],
      ['100%', 2_050],
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
