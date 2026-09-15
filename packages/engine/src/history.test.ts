import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.js';
import { type Card, makeDeck, parseCards } from './cards.js';
import { handHistory } from './history.js';
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

function stackedDeck(p0: string, p1: string, board = '2c 7d 9h Js 4s'): Card[] {
  const chosen = [...parseCards(p0), ...parseCards(p1), ...parseCards(board)];
  return [...chosen, ...makeDeck().filter((card) => !chosen.includes(card))];
}

const hand = (overrides: Partial<SpotConfig> = {}, deck = makeDeck()): HandState =>
  createHand(spot(overrides), { deck, handNumber: 12, startedAt: '2026-09-15T18:30:00.000Z' });

const play = (state: HandState, ...actions: Action[]): HandState =>
  actions.reduce((current, action) => applyAction(current, action), state);

describe('hand history', () => {
  it('writes a header, seats and posts', () => {
    const text = handHistory(hand({}, stackedDeck('As Kd', 'Qh Qc')));
    const lines = text.split('\n');
    expect(lines[0]).toBe(
      "PokerStars Hand #12: Tournament #MTT-SPOT, Hold'em No Limit - Level (50/100) - 2026/09/15 18:30:00 ET",
    );
    expect(lines[1]).toBe("Table 'MTT-SPOT' 9-max Seat #9 is the button");
    expect(text).toContain('Seat 1: SB (10000 in chips)');
    expect(text).toContain('Seat 2: BB (10000 in chips)');
    expect(text).toContain('Seat 9: BTN (10000 in chips)');
    expect(text).toContain('SB: posts small blind 50');
    expect(text).toContain('BB: posts big blind 100');
    expect(text).toContain('Dealt to BTN [As Kd]');
    expect(text).toContain('Dealt to BB [Qh Qc]');
  });

  it('folds the dead seats out so the pot adds up', () => {
    const text = handHistory(hand({}, stackedDeck('As Kd', 'Qh Qc')));
    // Seven seats are not in play; the small blind is one of them.
    expect(text.match(/: folds/g)).toHaveLength(7);
    expect(text).toContain('SB: posts small blind 50');
    expect(text.indexOf('SB: folds')).toBeGreaterThan(text.indexOf('BTN:'));
  });

  it('can leave the dead seats out', () => {
    const text = handHistory(hand({}, stackedDeck('As Kd', 'Qh Qc')), { includeDeadSeats: false });
    expect(text).not.toContain('SB: posts small blind');
    expect(text).toContain('Seat 2: BB (10000 in chips)');
    expect(text).not.toContain('Seat 1: SB');
  });

  it('writes raises as "raises X to Y"', () => {
    const state = play(hand({}, stackedDeck('As Kd', 'Qh Qc')), { type: 'raise', to: 250 }, { type: 'raise', to: 800 }, { type: 'call' });
    const text = handHistory(state);
    expect(text).toContain('BTN: raises 150 to 250');
    expect(text).toContain('BB: raises 550 to 800');
    expect(text).toContain('BTN: calls 550');
  });

  it('writes streets, bets and the uncalled bet on a fold', () => {
    const state = play(
      hand({}, stackedDeck('As Kd', 'Qh Qc')),
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'bet', to: 300 },
      { type: 'fold' },
    );
    const text = handHistory(state);
    expect(text).toContain('*** FLOP *** [2c 7d 9h]');
    expect(text).toContain('BB: checks');
    expect(text).toContain('BTN: bets 300');
    expect(text).toContain('BB: folds');
    expect(text).toContain('Uncalled bet (300) returned to BTN');
    expect(text).toContain('BTN collected 250 from pot');
    expect(text).toContain('Total pot 250 | Rake 0');
  });

  it('writes the turn and river with the running board', () => {
    const state = play(
      hand({}, stackedDeck('As Kd', 'Qh Qc')),
      { type: 'call' },
      { type: 'check' },
      ...Array<Action>(6).fill({ type: 'check' }),
    );
    const text = handHistory(state);
    expect(text).toContain('*** FLOP *** [2c 7d 9h]');
    expect(text).toContain('*** TURN *** [2c 7d 9h] [Js]');
    expect(text).toContain('*** RIVER *** [2c 7d 9h Js] [4s]');
    expect(text).toContain('Board [2c 7d 9h Js 4s]');
  });

  it('writes a showdown with both hands', () => {
    const state = play(
      hand({}, stackedDeck('As Kd', 'Qh Qc')),
      { type: 'call' },
      { type: 'check' },
      ...Array<Action>(6).fill({ type: 'check' }),
    );
    const text = handHistory(state);
    expect(text).toContain('*** SHOW DOWN ***');
    expect(text).toContain('BTN: shows [As Kd] (high card Ace)');
    expect(text).toContain('BB: shows [Qh Qc] (a pair of Queens)');
    expect(text).toContain('BB collected 250 from pot');
    expect(text).toContain('and won (250) with a pair of Queens');
  });

  it('writes antes', () => {
    const bbAnte = handHistory(hand({ anteType: 'bb', ante: 100 }, stackedDeck('As Kd', 'Qh Qc')));
    expect(bbAnte).toContain('BB: posts the ante 100');
    expect(bbAnte.match(/posts the ante/g)).toHaveLength(1);

    const perPlayer = handHistory(hand({ anteType: 'per-player', ante: 20 }, stackedDeck('As Kd', 'Qh Qc')));
    expect(perPlayer.match(/posts the ante 20/g)).toHaveLength(9);
  });

  it('marks all-in actions', () => {
    const state = play(hand({ stacks: [2_000, 2_000] }, stackedDeck('As Kd', 'Qh Qc')), { type: 'all-in' });
    expect(handHistory(state)).toContain('BTN: raises 1900 to 2000 and is all-in');
  });

  it('uses supplied player names and can hide the opponent hand', () => {
    const text = handHistory(hand({}, stackedDeck('As Kd', 'Qh Qc')), {
      playerNames: ['Isaac', 'Friend'],
      heroIndex: 0,
    });
    expect(text).toContain('Seat 9: Isaac (10000 in chips)');
    expect(text).toContain('Dealt to Isaac [As Kd]');
    expect(text).not.toContain('Dealt to Friend');
  });

  it('works for a 2-handed table where the small blind is the button', () => {
    const text = handHistory(hand({ tableSize: 2, positions: ['SB', 'BB'] }, stackedDeck('As Kd', 'Qh Qc')));
    expect(text).toContain("Table 'MTT-SPOT' 2-max Seat #2 is the button");
    expect(text).toContain('Seat 1: BB (10000 in chips)');
    expect(text).toContain('Seat 2: SB (10000 in chips)');
    expect(text).not.toContain(': folds');
  });

  it('works on a hand that is still in progress', () => {
    const state = play(hand({}, stackedDeck('As Kd', 'Qh Qc')), { type: 'raise', to: 250 });
    const text = handHistory(state);
    expect(text).toContain('BTN: raises 150 to 250');
    expect(text).not.toContain('*** SUMMARY ***');
  });
});
