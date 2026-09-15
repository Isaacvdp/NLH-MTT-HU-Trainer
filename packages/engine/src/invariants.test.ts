/**
 * Randomised play: whatever sequence of legal actions is taken, the engine must
 * terminate, conserve chips, and never leave the pot or a stack negative.
 */

import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './actions.js';
import { seededRandomInt, shuffledDeck } from './cards.js';
import { createHand } from './setup.js';
import type { Action, AnteType, HandState, SpotConfig } from './types.js';
import type { Position } from './positions.js';
import { preflopOrder } from './positions.js';
import { sizingOptions } from './sizing.js';

const ANTE_TYPES: AnteType[] = ['none', 'bb', 'per-player'];

function randomSpot(randomInt: (max: number) => number): SpotConfig {
  const tableSize = 2 + randomInt(8);
  const seats = preflopOrder(tableSize);
  const first = randomInt(seats.length);
  let second = randomInt(seats.length);
  while (second === first) second = randomInt(seats.length);
  const bigBlind = [100, 200, 500, 75][randomInt(4)]!;
  const anteType = ANTE_TYPES[randomInt(ANTE_TYPES.length)]!;

  return {
    tableSize,
    smallBlind: Math.round(bigBlind / 2),
    bigBlind,
    anteType,
    ante: anteType === 'bb' ? bigBlind : Math.max(1, Math.round(bigBlind / 8)),
    positions: [seats[first] as Position, seats[second] as Position],
    // Anything from under one big blind to a deep stack.
    stacks: [
      1 + randomInt(60 * bigBlind),
      1 + randomInt(60 * bigBlind),
    ],
  };
}

function randomAction(state: HandState, randomInt: (max: number) => number): Action {
  const legal = legalActions(state)!;
  const type = legal.types[randomInt(legal.types.length)]!;
  if (type === 'bet' || type === 'raise') {
    const options = sizingOptions(state, legal);
    const option = options[randomInt(options.length)];
    return { type, to: option ? option.to : type === 'bet' ? legal.minBetTo : legal.minRaiseTo };
  }
  return { type } as Action;
}

describe('randomised hands', () => {
  it('always terminate and conserve chips', () => {
    const randomInt = seededRandomInt(20260915);

    for (let i = 0; i < 2_000; i++) {
      const config = randomSpot(randomInt);
      let state = createHand(config, { deck: shuffledDeck(randomInt), handNumber: i + 1 });

      let steps = 0;
      while (!state.complete) {
        expect(state.toAct).not.toBeNull();
        const legal = legalActions(state)!;
        expect(legal.types.length).toBeGreaterThan(0);
        expect(legal.player).toBe(state.toAct);

        state = applyAction(state, randomAction(state, randomInt));

        expect(state.pot).toBeGreaterThanOrEqual(0);
        for (const player of state.players) {
          expect(player.stack).toBeGreaterThanOrEqual(0);
          expect(player.committedTotal).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(player.stack)).toBe(true);
        }
        // Chips in the middle always equal dead money plus what both players put in.
        if (!state.complete) {
          expect(state.pot).toBe(
            state.deadMoney + state.players[0].committedTotal + state.players[1].committedTotal,
          );
        }

        steps += 1;
        expect(steps).toBeLessThan(60);
      }

      // Everything that went in comes back out.
      expect(state.pot).toBe(0);
      const chipsOut = state.players[0].stack + state.players[1].stack;
      expect(chipsOut).toBe(config.stacks[0] + config.stacks[1] + state.deadMoney);
      expect(state.result).not.toBeNull();
      expect(state.result!.net[0] + state.result!.net[1]).toBe(state.deadMoney);

      // The board only exists when the hand got that far.
      expect(state.board.length).toBeLessThanOrEqual(5);
      if (state.result!.wentToShowdown) expect(state.board).toHaveLength(5);

      // Hole cards and board never collide.
      const all = [...state.players[0].holeCards!, ...state.players[1].holeCards!, ...state.board];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('never offers a raise that the opponent could not cover', () => {
    const randomInt = seededRandomInt(7);
    for (let i = 0; i < 500; i++) {
      const config = randomSpot(randomInt);
      let state = createHand(config, { deck: shuffledDeck(randomInt) });
      while (!state.complete) {
        const legal = legalActions(state)!;
        const opponent = state.players[state.toAct === 0 ? 1 : 0];
        expect(legal.maxTo).toBeLessThanOrEqual(opponent.committedThisStreet + opponent.stack);
        if (legal.types.includes('raise')) {
          expect(legal.minRaiseTo).toBeGreaterThan(legal.callTo);
          expect(legal.minRaiseTo).toBeLessThanOrEqual(legal.maxTo);
        }
        state = applyAction(state, randomAction(state, randomInt));
      }
    }
  });
});
