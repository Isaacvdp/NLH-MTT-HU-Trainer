/**
 * Local hot-seat game: both players share one screen and the engine runs in the
 * browser. The same flow will later be driven by Supabase Edge Functions, so
 * everything here goes through `applyAction` rather than touching state directly.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  applyAction,
  createHand,
  cryptoRandomInt,
  randomStack,
  type Action,
  type AnteType,
  type HandState,
  type PlayerIndex,
  type Position,
  type SpotConfig,
} from 'engine';

export type StackMode = 'fixed' | 'random';

export interface Settings {
  tableSize: number;
  positions: [Position, Position];
  smallBlind: number;
  bigBlind: number;
  anteType: AnteType;
  ante: number;
  stackMode: StackMode;
  /** Starting stack in big blinds when `stackMode` is `'fixed'`. */
  stackBb: number;
  minStackBb: number;
  maxStackBb: number;
  swapSeatsEachHand: boolean;
  revealHandsAfterHand: boolean;
  carryStacksOver: boolean;
  /** Hide the waiting player's cards so one device can be passed around. */
  hideWaitingPlayer: boolean;
  playerNames: [string, string];
}

export const DEFAULT_SETTINGS: Settings = {
  tableSize: 9,
  positions: ['BTN', 'BB'],
  smallBlind: 50,
  bigBlind: 100,
  anteType: 'bb',
  ante: 100,
  stackMode: 'fixed',
  stackBb: 40,
  minStackBb: 15,
  maxStackBb: 60,
  swapSeatsEachHand: true,
  revealHandsAfterHand: false,
  carryStacksOver: false,
  hideWaitingPlayer: true,
  playerNames: ['Player 1', 'Player 2'],
};

/** Chips each human has, independent of the seat they are in this hand. */
type Bankroll = [number, number];

export interface FinishedHand {
  hand: HandState;
  /** Who sat in each seat for this hand — seats can swap between hands. */
  names: [string, string];
}

export interface HotSeatState {
  settings: Settings;
  hand: HandState | null;
  /** Finished hands, newest first. */
  finished: FinishedHand[];
  /** Which human sits in each seat: `seatOf[seatIndex]` is a human index. */
  seatOf: [0 | 1, 0 | 1];
  bankroll: Bankroll;
  handNumber: number;
  /** Set when a hand cannot start, e.g. somebody is out of chips. */
  error: string | null;
}

function startingStack(settings: Settings): number {
  if (settings.stackMode === 'random') {
    return randomStack(settings.minStackBb, settings.maxStackBb, settings.bigBlind, cryptoRandomInt);
  }
  return Math.round(settings.stackBb * settings.bigBlind);
}

export function configFor(settings: Settings, stacks: [number, number]): SpotConfig {
  return {
    tableSize: settings.tableSize,
    smallBlind: settings.smallBlind,
    bigBlind: settings.bigBlind,
    anteType: settings.anteType,
    ante: settings.anteType === 'none' ? 0 : settings.ante,
    positions: settings.positions,
    stacks,
  };
}

export function useHotSeat() {
  const [state, setState] = useState<HotSeatState>({
    settings: DEFAULT_SETTINGS,
    hand: null,
    finished: [],
    seatOf: [0, 1],
    bankroll: [0, 0],
    handNumber: 0,
    error: null,
  });

  const setSettings = useCallback((update: Partial<Settings>) => {
    setState((current) => ({ ...current, settings: { ...current.settings, ...update }, error: null }));
  }, []);

  /** Starts a fresh session: resets bankrolls and the hand log. */
  const startSession = useCallback(() => {
    setState((current) => {
      const stacks: Bankroll = [startingStack(current.settings), startingStack(current.settings)];
      return dealNext({ ...current, bankroll: stacks, finished: [], handNumber: 0, seatOf: [0, 1] }, stacks);
    });
  }, []);

  const nextHand = useCallback(() => {
    setState((current) => {
      const settings = current.settings;
      const seatOf: [0 | 1, 0 | 1] = settings.swapSeatsEachHand
        ? [current.seatOf[1], current.seatOf[0]]
        : current.seatOf;

      let bankroll = current.bankroll;
      if (!settings.carryStacksOver) {
        bankroll = [startingStack(settings), startingStack(settings)];
      }
      return dealNext({ ...current, seatOf, bankroll }, bankroll);
    });
  }, []);

  const act = useCallback((action: Action) => {
    setState((current) => {
      if (!current.hand || current.hand.complete) return current;
      let hand: HandState;
      try {
        hand = applyAction(current.hand, action);
      } catch (error) {
        return { ...current, error: error instanceof Error ? error.message : String(error) };
      }

      let bankroll = current.bankroll;
      let finished = current.finished;
      if (hand.complete) {
        const names = namesForSeats(current);
        finished = [{ hand, names }, ...current.finished];
        // Stacks follow the human, not the seat.
        bankroll = [...current.bankroll] as Bankroll;
        for (const seat of [0, 1] as const) {
          bankroll[current.seatOf[seat]] = hand.players[seat].stack;
        }
      }
      return { ...current, hand, finished, bankroll, error: null };
    });
  }, []);

  const endSession = useCallback(() => {
    setState((current) => ({ ...current, hand: null, error: null }));
  }, []);

  /** Human index sitting in a seat, and the reverse lookup. */
  const seatOfHuman = useCallback(
    (human: 0 | 1): PlayerIndex => (state.seatOf[0] === human ? 0 : 1),
    [state.seatOf],
  );

  const nameOfSeat = useCallback((seat: PlayerIndex): string => namesForSeats(state)[seat], [state]);

  return useMemo(
    () => ({ state, setSettings, startSession, nextHand, act, endSession, seatOfHuman, nameOfSeat }),
    [state, setSettings, startSession, nextHand, act, endSession, seatOfHuman, nameOfSeat],
  );
}

/** Player names indexed by seat rather than by human. */
function namesForSeats(state: HotSeatState): [string, string] {
  const names = state.settings.playerNames;
  return [names[state.seatOf[0]] ?? 'Player 1', names[state.seatOf[1]] ?? 'Player 2'];
}

function dealNext(current: HotSeatState, bankroll: Bankroll): HotSeatState {
  const settings = current.settings;
  // seatOf[seat] is the human in that seat, so their chips go into that seat.
  const stacks: [number, number] = [bankroll[current.seatOf[0]], bankroll[current.seatOf[1]]];

  if (stacks[0] <= 0 || stacks[1] <= 0) {
    const broke = settings.playerNames[stacks[0] <= 0 ? current.seatOf[0] : current.seatOf[1]];
    return { ...current, hand: null, error: `${broke} is out of chips. Reset the stacks to keep playing.` };
  }

  const handNumber = current.handNumber + 1;
  try {
    const hand = createHand(configFor(settings, stacks), { handNumber });
    return { ...current, hand, handNumber, error: null };
  } catch (error) {
    return { ...current, hand: null, error: error instanceof Error ? error.message : String(error) };
  }
}
