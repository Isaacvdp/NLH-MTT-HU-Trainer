/**
 * Your own saved ranges.
 *
 * The engine ships an approximate opening range for every seat. Once you have
 * tuned one you can save it, and from then on that seat starts from yours
 * instead — in this browser, across sessions, for every spot you set up.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultRangeFor, parseRangeArray, type Position, type Range } from 'engine';

export type SavedRanges = Partial<Record<Position, Range>>;

const STORAGE_KEY = 'mtt-trainer.ranges';

function load(): SavedRanges {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const saved: SavedRanges = {};
    for (const [position, value] of Object.entries(parsed)) {
      try {
        saved[position as Position] = parseRangeArray(value);
      } catch {
        // Skip anything that is no longer a valid range rather than losing the lot.
      }
    }
    return saved;
  } catch {
    return {};
  }
}

export interface RangeLibrary {
  saved: SavedRanges;
  /** Your saved range for a seat, or the built-in one if you have not saved any. */
  defaultFor: (position: Position) => Range;
  /** True when this seat is using a range you saved. */
  hasSaved: (position: Position) => boolean;
  save: (position: Position, range: Range) => void;
  forget: (position: Position) => void;
}

const RangeLibraryContext = createContext<RangeLibrary | null>(null);

export function RangeLibraryProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedRanges>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Not being able to remember a range is not worth interrupting setup.
    }
  }, [saved]);

  const value = useMemo<RangeLibrary>(
    () => ({
      saved,
      defaultFor: (position) => saved[position] ?? defaultRangeFor(position),
      hasSaved: (position) => saved[position] !== undefined,
      save: (position, range) => setSaved((current) => ({ ...current, [position]: [...range] })),
      forget: (position) =>
        setSaved((current) => {
          const next = { ...current };
          delete next[position];
          return next;
        }),
    }),
    [saved],
  );

  return <RangeLibraryContext.Provider value={value}>{children}</RangeLibraryContext.Provider>;
}

export function useRangeLibrary(): RangeLibrary {
  const value = useContext(RangeLibraryContext);
  if (!value) throw new Error('useRangeLibrary needs a RangeLibraryProvider above it');
  return value;
}

/** Ranges for a pair of seats, honouring anything you have saved. */
export function defaultRangesFor(
  library: RangeLibrary,
  positions: [Position, Position],
): [Range, Range] {
  return [library.defaultFor(positions[0]), library.defaultFor(positions[1])];
}
