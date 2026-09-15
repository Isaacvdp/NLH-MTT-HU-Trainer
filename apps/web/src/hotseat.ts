/**
 * Local hot-seat game: both players share one screen and the engine runs in the
 * browser. Online rooms use the same settings and the same engine, just with an
 * Edge Function in the middle.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_ROOM_SETTINGS,
  applyAction,
  configForSettings,
  createHand,
  cryptoRandomInt,
  nextSeatOf,
  stacksForNextHand,
  type Action,
  type HandState,
  type HandView,
  type PlayerIndex,
  type RoomSettings,
} from 'engine';

/** Room settings plus the one option that only makes sense on a shared screen. */
export interface Settings extends RoomSettings {
  /** Hide the waiting player's cards so one device can be passed around. */
  hideWaitingPlayer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_ROOM_SETTINGS,
  hideWaitingPlayer: true,
};

/** Chips each person has, independent of the seat they are in this hand. */
type Bankroll = [number, number];

export interface FinishedHand {
  hand: HandView;
  /** Who sat in each seat for this hand — seats can swap between hands. */
  names: [string, string];
}

export interface HotSeatState {
  settings: Settings;
  hand: HandState | null;
  /** Finished hands, newest first. */
  finished: FinishedHand[];
  /** `seatOf[seatIndex]` is the person sitting in that seat. */
  seatOf: [0 | 1, 0 | 1];
  bankroll: Bankroll;
  handNumber: number;
  /** Set when a hand cannot start, e.g. somebody is out of chips. */
  error: string | null;
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
    setState((current) =>
      dealNext({ ...current, finished: [], handNumber: 0, seatOf: [0, 1] }, true),
    );
  }, []);

  const nextHand = useCallback(() => {
    setState((current) => {
      const seatOf = nextSeatOf(current.seatOf, current.settings);
      return dealNext({ ...current, seatOf }, false);
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
        finished = [{ hand, names: namesForSeats(current) }, ...current.finished];
        // Stacks follow the person, not the seat.
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

  const nameOfSeat = useCallback((seat: PlayerIndex): string => namesForSeats(state)[seat], [state]);

  return useMemo(
    () => ({ state, setSettings, startSession, nextHand, act, endSession, nameOfSeat }),
    [state, setSettings, startSession, nextHand, act, endSession, nameOfSeat],
  );
}

/** Player names indexed by seat rather than by person. */
function namesForSeats(state: HotSeatState): [string, string] {
  const names = state.settings.playerNames;
  return [names[state.seatOf[0]] ?? 'Player 1', names[state.seatOf[1]] ?? 'Player 2'];
}

function dealNext(current: HotSeatState, isFirstHand: boolean): HotSeatState {
  const { settings, seatOf } = current;
  const stacks = stacksForNextHand(settings, seatOf, current.bankroll, cryptoRandomInt, isFirstHand);

  if (stacks[0] <= 0 || stacks[1] <= 0) {
    const broke = settings.playerNames[stacks[0] <= 0 ? seatOf[0] : seatOf[1]];
    return { ...current, hand: null, error: `${broke} is out of chips. Reset the stacks to keep playing.` };
  }

  // Bankroll is indexed by person, stacks by seat.
  const bankroll: Bankroll = [...current.bankroll] as Bankroll;
  for (const seat of [0, 1] as const) bankroll[seatOf[seat]] = stacks[seat];

  const handNumber = current.handNumber + 1;
  try {
    const hand = createHand(configForSettings(settings, stacks), {
      handNumber,
      ranges: settings.ranges,
    });
    return { ...current, hand, handNumber, bankroll, error: null };
  } catch (error) {
    return { ...current, hand: null, error: error instanceof Error ? error.message : String(error) };
  }
}
