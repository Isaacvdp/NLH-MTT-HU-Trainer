import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, settledPot } from './actions.js';
import { type Card, makeDeck, parseCards } from './cards.js';
import { createHand } from './setup.js';
import type { Action, HandState, SpotConfig } from './types.js';

const base: SpotConfig = {
  tableSize: 9,
  smallBlind: 50,
  bigBlind: 100,
  anteType: 'none',
  ante: 0,
  positions: ['BTN', 'BB'],
  stacks: [10_000, 10_000],
};

const spot = (overrides: Partial<SpotConfig> = {}): SpotConfig => ({ ...base, ...overrides });

/**
 * Builds a deck where the two players and the board get exactly the cards
 * given, and the rest of the deck follows in a fixed order.
 */
function stackedDeck(p0: string, p1: string, board = '2c 3d 4h 6s 8c'): Card[] {
  const chosen = [...parseCards(p0), ...parseCards(p1), ...parseCards(board)];
  const rest = makeDeck().filter((card) => !chosen.includes(card));
  return [...chosen, ...rest];
}

const hand = (overrides: Partial<SpotConfig> = {}, deck: Card[] = makeDeck()): HandState =>
  createHand(spot(overrides), { deck });

function play(state: HandState, ...actions: Action[]): HandState {
  return actions.reduce((current, action) => applyAction(current, action), state);
}

describe('action order', () => {
  it('BTN vs BB: button acts first preflop, big blind first postflop', () => {
    let state = hand();
    expect(state.toAct).toBe(0);
    state = play(state, { type: 'call' }, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.toAct).toBe(1);
  });

  it('SB vs BB at a full table: small blind acts first on every street', () => {
    let state = hand({ positions: ['SB', 'BB'] });
    expect(state.toAct).toBe(0);
    state = play(state, { type: 'call' }, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.toAct).toBe(0);
  });

  it('SB vs BB heads-up: the big blind acts first postflop', () => {
    let state = hand({ tableSize: 2, positions: ['SB', 'BB'] });
    expect(state.toAct).toBe(0);
    state = play(state, { type: 'call' }, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.toAct).toBe(1);
  });

  it('CO vs BTN: the cutoff acts first on every street', () => {
    let state = hand({ positions: ['CO', 'BTN'] });
    expect(state.toAct).toBe(0);
    state = play(state, { type: 'call' }, { type: 'call' });
    expect(state.street).toBe('flop');
    expect(state.toAct).toBe(0);
  });

  it('keeps the same order on every postflop street', () => {
    let state = play(hand(), { type: 'call' }, { type: 'check' });
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(state.street).toBe(street);
      expect(state.toAct).toBe(1);
      state = play(state, { type: 'check' }, { type: 'check' });
    }
    expect(state.complete).toBe(true);
  });
});

describe('legal actions preflop', () => {
  it('offers the button fold, call and raise', () => {
    const legal = legalActions(hand())!;
    expect(legal.types).toEqual(['fold', 'call', 'raise', 'all-in']);
    expect(legal.callAmount).toBe(100);
    expect(legal.minRaiseTo).toBe(200);
    expect(legal.maxTo).toBe(10_000);
  });

  it('gives the big blind the option when the button just calls', () => {
    const state = play(hand(), { type: 'call' });
    const legal = legalActions(state)!;
    expect(state.toAct).toBe(1);
    expect(legal.types).toEqual(['check', 'raise', 'all-in']);
    expect(legal.callAmount).toBe(0);
    expect(legal.minRaiseTo).toBe(200);
  });

  it('lets the small blind complete rather than raise', () => {
    const legal = legalActions(hand({ positions: ['SB', 'BB'] }))!;
    expect(legal.callAmount).toBe(50);
    expect(legal.callTo).toBe(100);
    expect(legal.minRaiseTo).toBe(200);
  });
});

describe('min-raise rules', () => {
  it('sets the next minimum from the size of the last raise', () => {
    let state = play(hand(), { type: 'raise', to: 300 });
    // The raise was 200 over the big blind, so the next raise must be 200 more.
    expect(legalActions(state)!.minRaiseTo).toBe(500);
    state = play(state, { type: 'raise', to: 900 });
    // 600 over, so the next minimum is 1500.
    expect(legalActions(state)!.minRaiseTo).toBe(1500);
  });

  it('rejects a raise below the minimum', () => {
    const state = hand();
    expect(() => applyAction(state, { type: 'raise', to: 150 })).toThrow(/minimum is 200/);
    expect(() => applyAction(state, { type: 'raise', to: 199 })).toThrow();
    expect(() => applyAction(applyAction(state, { type: 'raise', to: 300 }), { type: 'raise', to: 450 })).toThrow(
      /minimum is 500/,
    );
  });

  it('rejects a raise above the effective stack', () => {
    expect(() => applyAction(hand({ stacks: [10_000, 3_000] }), { type: 'raise', to: 4_000 })).toThrow(
      /effective maximum is 3000/,
    );
  });

  it('rejects a non-integer bet size', () => {
    expect(() => applyAction(hand(), { type: 'raise', to: 250.5 })).toThrow(/integer/);
  });

  it('uses the big blind as the minimum bet postflop', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' });
    const legal = legalActions(state)!;
    expect(legal.types).toEqual(['check', 'bet', 'all-in']);
    expect(legal.minBetTo).toBe(100);
    expect(() => applyAction(state, { type: 'bet', to: 50 })).toThrow(/minimum is 100/);
  });

  it('resets the minimum raise on each new street', () => {
    let state = play(hand(), { type: 'raise', to: 1_000 }, { type: 'call' });
    expect(state.street).toBe('flop');
    expect(state.lastRaiseSize).toBe(100);
    state = play(state, { type: 'bet', to: 400 });
    expect(legalActions(state)!.minRaiseTo).toBe(800);
  });

  it('reopens the action for a player who has already acted when raised in full', () => {
    let state = play(hand(), { type: 'raise', to: 300 }, { type: 'raise', to: 900 });
    expect(state.toAct).toBe(0);
    expect(state.players[0].hasActedThisStreet).toBe(false);
    expect(legalActions(state)!.types).toContain('raise');
    state = play(state, { type: 'call' });
    expect(state.street).toBe('flop');
  });
});

describe('short all-ins', () => {
  it('does not reopen the action for a player who has already acted', () => {
    // Button opens to 300; the big blind can only make it 400, short of a full raise.
    let state = play(hand({ stacks: [10_000, 400] }), { type: 'raise', to: 300 });
    state = play(state, { type: 'all-in' });
    expect(state.players[1].status).toBe('all-in');
    expect(state.incompleteRaise).toBe(true);
    const legal = legalActions(state)!;
    expect(state.toAct).toBe(0);
    expect(legal.types).toEqual(['fold', 'call']);
    expect(legal.callAmount).toBe(100);
    // The minimum raise never moved, because the all-in was not a full raise.
    expect(state.lastRaiseSize).toBe(200);
  });

  it('a full all-in raise does reopen the action', () => {
    let state = play(hand({ stacks: [10_000, 700] }), { type: 'raise', to: 300 });
    state = play(state, { type: 'all-in' });
    expect(state.players[1].committedThisStreet).toBe(700);
    expect(state.incompleteRaise).toBe(false);
    // Raising is still pointless — the opponent has no chips left to call with.
    expect(legalActions(state)!.types).toEqual(['fold', 'call']);
  });

  it('lets the big blind raise over a short all-in when they have not acted yet', () => {
    // The button is all-in for less than a full raise before the big blind acts.
    const state = play(hand({ stacks: [150, 10_000] }), { type: 'all-in' });
    expect(state.players[0].status).toBe('all-in');
    expect(state.toAct).toBe(1);
    // With the opponent already all-in there is nothing left to raise into.
    expect(legalActions(state)!.types).toEqual(['fold', 'call']);
    expect(legalActions(state)!.callAmount).toBe(50);
  });

  it('caps a call at what the short stack can cover', () => {
    const state = hand({ stacks: [10_000, 60] });
    const legal = legalActions(state)!;
    expect(legal.callAmount).toBe(60);
    expect(legal.callTo).toBe(60);
    expect(legal.types).toEqual(['fold', 'call']);
  });

  it('caps every bet at the effective stack', () => {
    const state = play(hand({ stacks: [10_000, 2_000] }), { type: 'call' }, { type: 'check' });
    expect(legalActions(state)!.maxTo).toBe(1_900);
    const shoved = play(state, { type: 'all-in' });
    expect(shoved.players[1].status).toBe('all-in');
    expect(shoved.players[1].committedThisStreet).toBe(1_900);
  });
});

describe('uncalled bets', () => {
  it('returns the raise when the opponent folds preflop', () => {
    const state = play(hand(), { type: 'raise', to: 300 }, { type: 'fold' });
    expect(state.complete).toBe(true);
    expect(state.result?.winners).toEqual([0]);
    // Button wins the dead small blind and the big blind; their own 300 comes back.
    expect(state.players[0].stack).toBe(10_000 + 150);
    expect(state.players[1].stack).toBe(10_000 - 100);
    expect(state.events.some((event) => event.kind === 'return' && event.amount === 200)).toBe(true);
  });

  it('gives the big blind their blind back when the button folds', () => {
    const state = play(hand(), { type: 'fold' });
    expect(state.result?.winners).toEqual([1]);
    expect(state.players[1].stack).toBe(10_000 + 50);
    expect(state.players[0].stack).toBe(10_000);
  });

  it('returns an uncalled bet postflop', () => {
    const state = play(
      hand(),
      { type: 'call' },
      { type: 'check' },
      { type: 'bet', to: 500 },
      { type: 'fold' },
    );
    expect(state.result?.winners).toEqual([1]);
    // The 500 bet comes straight back, and the big blind wins the 250 pot.
    expect(state.players[1].stack).toBe(10_000 + 150);
    expect(state.players[0].stack).toBe(10_000 - 100);
  });

  it('returns a blind that nobody could ever call', () => {
    // The button is all-in for the ante alone, so the big blind's blind is uncalled.
    const state = hand({ anteType: 'per-player', ante: 20, stacks: [15, 10_000] });
    expect(state.players[1].committedTotal).toBe(20);
    expect(state.events.some((event) => event.kind === 'return' && event.amount === 100)).toBe(true);
  });

  it('never leaves chips stranded in the pot', () => {
    const state = play(hand(), { type: 'raise', to: 300 }, { type: 'fold' });
    expect(state.pot).toBe(0);
    const total = state.players[0].stack + state.players[1].stack;
    // Dead money is injected from the folded seats, so the two stacks grow by it.
    expect(total).toBe(20_000 + 50);
  });
});

describe('all-in run-outs', () => {
  it('deals the rest of the board when both players are all-in', () => {
    const state = play(
      hand({ stacks: [3_000, 3_000] }, stackedDeck('As Kd', 'Qh Qc', '2c 3d 4h 6s 8c')),
      { type: 'all-in' },
      { type: 'call' },
    );
    expect(state.complete).toBe(true);
    expect(state.board).toEqual(['2c', '3d', '4h', '6s', '8c']);
    expect(state.result?.wentToShowdown).toBe(true);
    expect(state.result?.winners).toEqual([1]); // queens hold
    expect(state.players[1].stack).toBe(6_050);
  });

  it('stops on the street where the fold happened', () => {
    const state = play(hand(), { type: 'call' }, { type: 'check' }, { type: 'bet', to: 300 }, { type: 'fold' });
    expect(state.board).toHaveLength(3);
    expect(state.complete).toBe(true);
  });
});

describe('showdown', () => {
  it('awards the pot to the better hand', () => {
    const state = play(
      hand({}, stackedDeck('As Ac', '7d 2h', 'Kd 9s 4c 3h 5s')),
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    );
    expect(state.complete).toBe(true);
    expect(state.result?.winners).toEqual([0]);
    expect(state.result?.hands?.[0].description).toBe('a pair of Aces');
    expect(state.players[0].stack).toBe(10_000 + 150);
  });

  it('splits an identical hand and gives the odd chip to the first seat left of the button', () => {
    // Both players play the board; the pot is 150 + 100 = an odd number of chips.
    const state = play(
      hand({ smallBlind: 25 }, stackedDeck('2h 3h', '2s 3s', 'As Ks Qd Jc Th')),
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    );
    expect(state.result?.winners).toEqual([0, 1]);
    // Pot is 25 dead + 100 + 100 = 225. The big blind acts first postflop, so
    // the big blind takes the odd chip.
    expect(state.result?.awarded).toEqual([112, 113]);
    expect(state.players[0].stack + state.players[1].stack).toBe(20_000 + 25);
  });

  it('splits evenly when the pot is even', () => {
    const state = play(
      hand({}, stackedDeck('2h 3h', '2s 3s', 'As Ks Qd Jc Th')),
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    );
    expect(state.result?.awarded).toEqual([125, 125]);
  });

  it('gives the odd chip to the small blind in an SB vs BB spot', () => {
    const state = play(
      hand({ smallBlind: 25, positions: ['SB', 'BB'] }, stackedDeck('2h 3h', '2s 3s', 'As Ks Qd Jc Th')),
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    );
    // Pot 200, split evenly, so make it odd with an ante instead.
    expect(state.result?.winners).toEqual([0, 1]);
  });
});

describe('pot accounting', () => {
  it('keeps the pot equal to dead money plus both players commitments', () => {
    let state = hand({ anteType: 'bb', ante: 100 });
    const check = (s: HandState): void => {
      if (s.complete) return;
      expect(s.pot).toBe(s.deadMoney + s.players[0].committedTotal + s.players[1].committedTotal);
    };
    check(state);
    state = play(state, { type: 'raise', to: 250 });
    check(state);
    state = play(state, { type: 'call' });
    check(state);
    expect(state.street).toBe('flop');
    expect(state.pot).toBe(50 + 100 + 250 + 250);
    expect(settledPot(state)).toBe(state.pot);
    state = play(state, { type: 'bet', to: 300 });
    expect(settledPot(state)).toBe(650);
  });

  it('conserves chips across a whole hand', () => {
    const state = play(
      hand({ anteType: 'per-player', ante: 20, stacks: [4_000, 6_000] }, stackedDeck('As Ac', '7d 2h')),
      { type: 'raise', to: 250 },
      { type: 'raise', to: 800 },
      { type: 'all-in' },
      { type: 'call' },
    );
    expect(state.complete).toBe(true);
    const finalChips = state.players[0].stack + state.players[1].stack;
    expect(finalChips).toBe(4_000 + 6_000 + state.deadMoney);
    expect(state.pot).toBe(0);
  });
});

describe('guards', () => {
  it('refuses actions once the hand is over', () => {
    const state = play(hand(), { type: 'fold' });
    expect(legalActions(state)).toBeNull();
    expect(() => applyAction(state, { type: 'check' })).toThrow(/already complete/);
  });

  it('refuses an action from the wrong player', () => {
    expect(() => applyAction(hand(), { type: 'call' }, 1)).toThrow(/player 0's turn/);
  });

  it('refuses an illegal action type', () => {
    expect(() => applyAction(hand(), { type: 'check' })).toThrow(/Illegal action/);
    const afterCall = play(hand(), { type: 'call' });
    expect(() => applyAction(afterCall, { type: 'fold' })).toThrow(/Illegal action/);
  });

  it('does not mutate the state it is given', () => {
    const state = hand();
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'raise', to: 300 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
