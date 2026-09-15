import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.js';
import { makeDeck } from './cards.js';
import { formatEquity, formatRatio, oddsFacing, oddsLaid, potOdds } from './odds.js';
import { createHand } from './setup.js';
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

describe('potOdds', () => {
  it('works out the equity needed and the ratio', () => {
    // 100 to call into a pot of 300: you put in a quarter of the final pot.
    const odds = potOdds(300, 100);
    expect(odds.potAfterCall).toBe(400);
    expect(odds.equityNeeded).toBeCloseTo(0.25);
    expect(odds.ratio).toBe(3);
  });

  it('treats a pot-sized bet as needing a third', () => {
    // Facing a pot-sized bet: 100 into 200 (which already includes the bet).
    const odds = potOdds(200, 100);
    expect(odds.equityNeeded).toBeCloseTo(1 / 3);
    expect(odds.ratio).toBe(2);
  });

  it('has nothing to say when there is nothing to call', () => {
    const odds = potOdds(500, 0);
    expect(odds.equityNeeded).toBe(0);
    expect(odds.ratio).toBe(Infinity);
    expect(formatRatio(odds)).toBe('—');
  });

  it('formats for display', () => {
    expect(formatEquity(potOdds(300, 100))).toBe('25%');
    expect(formatRatio(potOdds(300, 100))).toBe('3 : 1');
    expect(formatRatio(potOdds(350, 100))).toBe('3.5 : 1');
    // Big ratios do not need a decimal place.
    expect(formatRatio(potOdds(1_200, 100))).toBe('12 : 1');
  });
});

describe('oddsFacing', () => {
  it('prices the preflop call', () => {
    // Pot is 150 (dead 50 + blind 100), and the button owes 100.
    const odds = oddsFacing(hand(), 0)!;
    expect(odds.toCall).toBe(100);
    expect(odds.pot).toBe(150);
    expect(odds.potAfterCall).toBe(250);
    expect(formatEquity(odds)).toBe('40%');
  });

  it('prices a postflop bet', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' }, { type: 'bet', to: 250 });
    // Pot is 250 from preflop plus the 250 bet; the button owes 250.
    const odds = oddsFacing(state, 0)!;
    expect(odds.pot).toBe(500);
    expect(odds.toCall).toBe(250);
    expect(formatEquity(odds)).toBe('33%');
    expect(formatRatio(odds)).toBe('2 : 1');
  });

  it('says nothing when there is no bet to face', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    expect(oddsFacing(state, 1)).toBeNull();
  });

  it('prices a call capped by the short stack', () => {
    // The big blind is all-in for 60, so the button only owes 60.
    const odds = oddsFacing(hand({ stacks: [10_000, 60] }), 0)!;
    expect(odds.toCall).toBe(60);
  });

  it('says nothing once the hand is over', () => {
    expect(oddsFacing(play(hand(), { type: 'fold' }), 1)).toBeNull();
  });
});

describe('oddsLaid', () => {
  it('prices what a pot-sized bet offers the opponent', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    expect(state.pot).toBe(250);

    // A pot-sized bet of 250 lays 2 : 1, so they need a third.
    const odds = oddsLaid(state, 1, 250)!;
    expect(odds.pot).toBe(500);
    expect(odds.toCall).toBe(250);
    expect(formatEquity(odds)).toBe('33%');
    expect(formatRatio(odds)).toBe('2 : 1');
  });

  it('prices a half-pot bet as needing a quarter', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    const odds = oddsLaid(state, 1, 125)!;
    expect(formatEquity(odds)).toBe('25%');
    expect(formatRatio(odds)).toBe('3 : 1');
  });

  it('counts only the extra the opponent still owes on a raise', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' }, { type: 'bet', to: 100 });
    // The big blind already has 100 out, so a raise to 400 costs them 300 more.
    const odds = oddsLaid(state, 0, 400)!;
    expect(odds.toCall).toBe(300);
    expect(odds.pot).toBe(350 + 400);
  });

  it('caps the price at what the opponent has behind', () => {
    const state = play(hand({ stacks: [10_000, 1_000] }), { type: 'call' }, { type: 'check' });
    // The big blind has 900 left, so no bet can ask them for more than that.
    const odds = oddsLaid(state, 0, 900)!;
    expect(odds.toCall).toBe(900);
  });

  it('says nothing when the opponent has no chips to call with', () => {
    const state = play(hand({ stacks: [10_000, 400] }), { type: 'raise', to: 300 }, { type: 'all-in' });
    expect(oddsLaid(state, 0, 400)).toBeNull();
  });
});
