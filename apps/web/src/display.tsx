/**
 * Viewing preferences: how amounts are written and how cards are coloured.
 *
 * These belong to the person looking at the screen, not to the table, so they
 * are kept out of the room settings and persisted per browser. Two people in
 * the same room can read it in chips and big blinds respectively.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { toBigBlinds } from 'engine';

export interface DisplayPrefs {
  /** Write stacks, pots and bets in big blinds instead of chips. */
  bigBlinds: boolean;
  /** Diamonds blue, clubs green, spades black, hearts red. */
  fourColorDeck: boolean;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  bigBlinds: false,
  fourColorDeck: false,
};

const STORAGE_KEY = 'mtt-trainer.display';

function load(): DisplayPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return {
      bigBlinds: typeof parsed.bigBlinds === 'boolean' ? parsed.bigBlinds : DEFAULT_PREFS.bigBlinds,
      fourColorDeck:
        typeof parsed.fourColorDeck === 'boolean' ? parsed.fourColorDeck : DEFAULT_PREFS.fourColorDeck,
    };
  } catch {
    // Private windows and blocked site data both land here.
    return DEFAULT_PREFS;
  }
}

interface DisplayContextValue {
  prefs: DisplayPrefs;
  setPrefs: (update: Partial<DisplayPrefs>) => void;
}

const DisplayContext = createContext<DisplayContextValue>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => undefined,
});

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<DisplayPrefs>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Not being able to remember the choice is not worth interrupting play.
    }
  }, [prefs]);

  // The deck colouring is a whole-page concern, so it rides on the root element.
  useEffect(() => {
    document.documentElement.dataset['deck'] = prefs.fourColorDeck ? 'four' : 'two';
  }, [prefs.fourColorDeck]);

  const setPrefs = useCallback((update: Partial<DisplayPrefs>) => {
    setState((current) => ({ ...current, ...update }));
  }, []);

  const value = useMemo(() => ({ prefs, setPrefs }), [prefs, setPrefs]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplayPrefs(): DisplayContextValue {
  return useContext(DisplayContext);
}

export function formatAmount(chips: number, bigBlind: number, inBigBlinds: boolean): string {
  return inBigBlinds ? toBigBlinds(chips, bigBlind) : chips.toLocaleString('en-US');
}

/**
 * Amount formatters bound to this table's big blind, so call sites do not have
 * to thread the preference through themselves.
 */
export function useAmounts(bigBlind: number) {
  const { prefs } = useDisplayPrefs();

  return useMemo(
    () => ({
      inBigBlinds: prefs.bigBlinds,
      /** `'2,500'` or `'25bb'`, depending on the preference. */
      format: (chips: number): string => formatAmount(chips, bigBlind, prefs.bigBlinds),
      /** Always shows both, for places with room: `'2,500 · 25bb'`. */
      formatBoth: (chips: number): string =>
        `${chips.toLocaleString('en-US')} · ${toBigBlinds(chips, bigBlind)}`,
      /** `'+150'` / `'-150'`, in whichever unit is selected. */
      signed: (chips: number): string =>
        `${chips > 0 ? '+' : ''}${formatAmount(chips, bigBlind, prefs.bigBlinds)}`,
      /** The unit the custom bet box is working in. */
      unit: prefs.bigBlinds ? 'bb' : 'chips',
      /** Turns a number typed in the current unit into chips. */
      toChips: (typed: number): number =>
        prefs.bigBlinds ? Math.round(typed * bigBlind) : Math.round(typed),
      /** Turns chips into a number for the custom bet box. */
      fromChips: (chips: number): number =>
        prefs.bigBlinds ? Number((chips / bigBlind).toFixed(2)) : chips,
    }),
    [bigBlind, prefs.bigBlinds],
  );
}
