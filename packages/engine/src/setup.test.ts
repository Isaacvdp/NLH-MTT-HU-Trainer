import { describe, expect, it } from 'vitest';
import { makeDeck } from './cards.js';
import { createHand, deadMoneyFor, validateSpotConfig } from './setup.js';
import type { SpotConfig } from './types.js';

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
const hand = (overrides: Partial<SpotConfig> = {}) => createHand(spot(overrides), { deck: makeDeck() });

describe('dead money', () => {
  it('BTN vs BB: only the small blind is dead', () => {
    const state = hand();
    expect(state.deadMoney).toBe(50);
    expect(state.pot).toBe(50 + 100);
  });

  it('CO vs BB: the small blind is dead, the big blind is live', () => {
    const state = hand({ positions: ['CO', 'BB'] });
    expect(state.deadMoney).toBe(50);
    expect(state.pot).toBe(150);
  });

  it('CO vs BTN: both blinds are dead', () => {
    const state = hand({ positions: ['CO', 'BTN'] });
    expect(state.deadMoney).toBe(150);
    expect(state.pot).toBe(150);
    expect(state.players.every((player) => player.committedThisStreet === 0)).toBe(true);
  });

  it('SB vs BB: nothing is dead', () => {
    const state = hand({ positions: ['SB', 'BB'] });
    expect(state.deadMoney).toBe(0);
    expect(state.pot).toBe(150);
  });

  it('BTN vs SB: the big blind is dead', () => {
    const state = hand({ positions: ['BTN', 'SB'] });
    expect(state.deadMoney).toBe(100);
    expect(state.pot).toBe(150);
  });
});

describe('big blind ante', () => {
  it('is posted by a live big blind and is not part of their live bet', () => {
    const state = hand({ anteType: 'bb', ante: 100 });
    const bb = state.players[1];
    expect(bb.committedThisStreet).toBe(100); // the blind only
    expect(bb.committedTotal).toBe(200); // blind plus ante
    expect(bb.stack).toBe(10_000 - 200);
    expect(state.deadMoney).toBe(50);
    expect(state.pot).toBe(50 + 200);
  });

  it('is dead money when the big blind seat is not live', () => {
    const state = hand({ positions: ['CO', 'BTN'], anteType: 'bb', ante: 100 });
    expect(state.deadMoney).toBe(50 + 100 + 100);
    expect(state.pot).toBe(250);
  });
});

describe('per-player ante', () => {
  it('charges every seat; the folded seats are dead money', () => {
    const state = hand({ anteType: 'per-player', ante: 20 });
    // 9 seats × 20 = 180 of antes; 7 of those seats are folded.
    expect(state.deadMoney).toBe(50 + 7 * 20);
    expect(state.pot).toBe(50 + 140 + 100 + 2 * 20);
    expect(state.players[0].stack).toBe(10_000 - 20);
    expect(state.players[1].stack).toBe(10_000 - 20 - 100);
  });

  it('scales with table size', () => {
    expect(deadMoneyFor(spot({ tableSize: 6, anteType: 'per-player', ante: 20 }))).toBe(50 + 4 * 20);
    expect(deadMoneyFor(spot({ tableSize: 3, anteType: 'per-player', ante: 20 }))).toBe(50 + 20);
  });

  it('matches the pot the hand is actually built with', () => {
    for (const tableSize of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const config = spot({
        tableSize,
        positions: tableSize === 2 ? ['SB', 'BB'] : ['BTN', 'BB'],
        anteType: 'per-player',
        ante: 20,
      });
      const state = createHand(config, { deck: makeDeck() });
      const live = state.players[0].committedTotal + state.players[1].committedTotal;
      expect(deadMoneyFor(config)).toBe(state.deadMoney);
      expect(state.pot).toBe(state.deadMoney + live);
      // Every seat anted, and both blinds are in the pot exactly once.
      expect(state.pot).toBe(tableSize * 20 + 150);
    }
  });
});

describe('short stacks at posting time', () => {
  it('posts a partial big blind and marks the player all-in', () => {
    const state = hand({ stacks: [10_000, 60] });
    const bb = state.players[1];
    expect(bb.committedThisStreet).toBe(60);
    expect(bb.stack).toBe(0);
    expect(bb.status).toBe('all-in');
    expect(state.pot).toBe(50 + 60);
    expect(state.toAct).toBe(0); // the button still has a decision
  });

  it('takes the ante before the blind', () => {
    const state = hand({ anteType: 'bb', ante: 100, stacks: [10_000, 120] });
    const bb = state.players[1];
    expect(bb.committedTotal).toBe(120);
    expect(bb.committedThisStreet).toBe(20); // 100 ante, then 20 of the blind
    expect(bb.status).toBe('all-in');
  });

  it('can leave a player all-in for part of the ante', () => {
    // The button cannot even cover the ante, so there is nothing left to decide
    // and the hand runs itself out.
    const state = hand({ anteType: 'per-player', ante: 20, stacks: [15, 10_000] });
    expect(state.players[0].committedTotal).toBe(15);
    expect(state.complete).toBe(true);
    expect(state.result?.wentToShowdown).toBe(true);
    // The big blind's uncalled blind comes back; only the antes and dead money play.
    expect(state.players[1].committedTotal).toBe(20);
  });

  it('runs the board out when both players are all-in from posting', () => {
    const state = hand({ positions: ['SB', 'BB'], stacks: [50, 100] });
    expect(state.complete).toBe(true);
    expect(state.board).toHaveLength(5);
    expect(state.result?.wentToShowdown).toBe(true);
  });
});

describe('dealing', () => {
  it('gives each player two cards and leaves the rest in the deck', () => {
    const state = hand();
    expect(state.players[0].holeCards).toEqual(['2c', '2d']);
    expect(state.players[1].holeCards).toEqual(['2h', '2s']);
    expect(state.deck).toHaveLength(48);
    expect(state.board).toEqual([]);
  });

  it('shuffles when no deck is supplied', () => {
    const a = createHand(spot());
    const b = createHand(spot());
    const cards = [...a.players[0].holeCards!, ...a.players[1].holeCards!];
    expect(new Set(cards).size).toBe(4);
    expect(a.deck).toHaveLength(48);
    // Two random hands being identical is possible but vanishingly unlikely.
    expect(JSON.stringify(a.deck)).not.toBe(JSON.stringify(b.deck));
  });
});

describe('validation', () => {
  it('rejects two of the same position', () => {
    expect(() => validateSpotConfig(spot({ positions: ['BTN', 'BTN'] }))).toThrow(/different/);
  });

  it('rejects a seat that does not exist at this table size', () => {
    expect(() => validateSpotConfig(spot({ tableSize: 5, positions: ['UTG', 'BB'] }))).toThrow(/does not exist/);
  });

  it('rejects non-integer or negative chip amounts', () => {
    expect(() => validateSpotConfig(spot({ stacks: [0, 100] }))).toThrow();
    expect(() => validateSpotConfig(spot({ stacks: [100.5, 100] }))).toThrow();
    expect(() => validateSpotConfig(spot({ bigBlind: 0 }))).toThrow();
    expect(() => validateSpotConfig(spot({ smallBlind: 200 }))).toThrow(/larger/);
  });

  it('requires an ante size when an ante is configured', () => {
    expect(() => validateSpotConfig(spot({ anteType: 'bb', ante: 0 }))).toThrow();
  });

  it('rejects a deck with duplicates', () => {
    expect(() => createHand(spot(), { deck: ['As', 'As', 'Kd', 'Qd', '2c', '3c', '4c', '5c', '6c'] })).toThrow(
      /duplicate/i,
    );
  });
});
