import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.js';
import { type Card, makeDeck, parseCards } from './cards.js';
import { isSafeToPublish, revealedSeats, toPublicState } from './public.js';
import { createHand } from './setup.js';
import type { Action, HandState, SpotConfig } from './types.js';

const spot: SpotConfig = {
  tableSize: 9,
  smallBlind: 50,
  bigBlind: 100,
  anteType: 'none',
  ante: 0,
  positions: ['BTN', 'BB'],
  stacks: [10_000, 10_000],
};

function stackedDeck(p0: string, p1: string, board = '2c 7d 9h Js 4s'): Card[] {
  const chosen = [...parseCards(p0), ...parseCards(p1), ...parseCards(board)];
  return [...chosen, ...makeDeck().filter((card) => !chosen.includes(card))];
}

const hand = (overrides: Partial<SpotConfig> = {}, deck = stackedDeck('As Kd', 'Qh Qc')): HandState =>
  createHand({ ...spot, ...overrides }, { deck });

const play = (state: HandState, ...actions: Action[]): HandState =>
  actions.reduce((current, action) => applyAction(current, action), state);

describe('toPublicState', () => {
  it('never carries the deck', () => {
    const view = toPublicState(hand());
    expect('deck' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('"deck"');
  });

  it('hides both hole cards by default', () => {
    const view = toPublicState(hand());
    expect(view.players[0].holeCards).toBeNull();
    expect(view.players[1].holeCards).toBeNull();
    expect(JSON.stringify(view)).not.toContain('As');
  });

  it('shows only the seats it is told to', () => {
    const view = toPublicState(hand(), { reveal: [0] });
    expect(view.players[0].holeCards).toEqual(['As', 'Kd']);
    expect(view.players[1].holeCards).toBeNull();
  });

  it('keeps the board, pot and everything else public', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    const view = toPublicState(state);
    expect(view.board).toHaveLength(3);
    expect(view.pot).toBe(250);
    expect(view.street).toBe('flop');
    expect(view.players[0].stack).toBe(9_900);
  });

  it('includes the legal actions for whoever is to act', () => {
    const view = toPublicState(hand());
    expect(view.legal?.player).toBe(0);
    expect(view.legal?.types).toEqual(['fold', 'call', 'raise', 'all-in']);
    expect(toPublicState(play(hand(), { type: 'fold' })).legal).toBeNull();
  });

  it('drops showdown events for a seat that is still hidden', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' }, ...Array<Action>(6).fill({ type: 'check' }));
    expect(state.result?.wentToShowdown).toBe(true);
    const hidden = toPublicState(state);
    expect(hidden.events.some((event) => event.kind === 'show')).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain('Qh');

    const shown = toPublicState(state, { reveal: [0, 1] });
    expect(shown.events.filter((event) => event.kind === 'show')).toHaveLength(2);
  });

  it('does not mutate the state it was given', () => {
    const state = hand();
    const before = JSON.stringify(state);
    toPublicState(state, { reveal: [0] });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('revealedSeats', () => {
  it('reveals nothing while a hand is in progress', () => {
    expect(revealedSeats(hand(), true)).toEqual([]);
  });

  it('reveals both hands at showdown regardless of the setting', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' }, ...Array<Action>(6).fill({ type: 'check' }));
    expect(revealedSeats(state, false)).toEqual([0, 1]);
  });

  it('reveals nothing after a fold unless the room asks for it', () => {
    const folded = play(hand(), { type: 'fold' });
    expect(revealedSeats(folded, false)).toEqual([]);
    expect(revealedSeats(folded, true)).toEqual([0, 1]);
  });
});

describe('isSafeToPublish', () => {
  it('accepts a view that matches what was revealed', () => {
    expect(isSafeToPublish(toPublicState(hand()), [])).toBe(true);
    expect(isSafeToPublish(toPublicState(hand(), { reveal: [1] }), [1])).toBe(true);
  });

  it('rejects a view holding cards nobody was allowed to see', () => {
    expect(isSafeToPublish(toPublicState(hand(), { reveal: [0] }), [])).toBe(false);
  });
});
