/**
 * Table positions for a simulated full-ring table.
 *
 * Only two seats are ever live, but action order is taken from the full table
 * the spot was lifted out of:
 *  - preflop: UTG acts first, the big blind acts last;
 *  - postflop: the first seat to the left of the button acts first.
 *
 * In a 2-handed game the small blind *is* the button, so the big blind acts
 * first postflop; at any other table size the small blind acts first postflop.
 */

export type Position = 'UTG' | 'UTG1' | 'UTG2' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export const MIN_TABLE_SIZE = 2;
export const MAX_TABLE_SIZE = 9;

/** Seats in preflop action order, per table size. */
const PREFLOP_ORDER: Record<number, readonly Position[]> = {
  2: ['SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export const POSITION_LABELS: Record<Position, string> = {
  UTG: 'UTG',
  UTG1: 'UTG+1',
  UTG2: 'UTG+2',
  LJ: 'LJ',
  HJ: 'HJ',
  CO: 'CO',
  BTN: 'BTN',
  SB: 'SB',
  BB: 'BB',
};

export function assertTableSize(tableSize: number): void {
  if (
    !Number.isInteger(tableSize) ||
    tableSize < MIN_TABLE_SIZE ||
    tableSize > MAX_TABLE_SIZE
  ) {
    throw new Error(`Table size must be an integer between 2 and 9, got ${tableSize}`);
  }
}

/** All seats at a table of this size, in preflop action order (UTG first, BB last). */
export function preflopOrder(tableSize: number): Position[] {
  assertTableSize(tableSize);
  return PREFLOP_ORDER[tableSize]!.slice();
}

/** All seats at a table of this size, in postflop action order (left of the button first). */
export function postflopOrder(tableSize: number): Position[] {
  assertTableSize(tableSize);
  // Heads-up the button is the small blind, so the big blind is first to act.
  if (tableSize === 2) return ['BB', 'SB'];
  const seats = PREFLOP_ORDER[tableSize]!;
  const nonBlinds = seats.slice(0, tableSize - 2);
  return ['SB', 'BB', ...nonBlinds];
}

/** Every seat at the table (unordered use only; preflop order by convention). */
export function tableSeats(tableSize: number): Position[] {
  return preflopOrder(tableSize);
}

export function isPositionAtTable(position: Position, tableSize: number): boolean {
  return preflopOrder(tableSize).includes(position);
}

/** Which seat is the button at this table size (the SB, heads-up). */
export function buttonPosition(tableSize: number): Position {
  return tableSize === 2 ? 'SB' : 'BTN';
}

function orderIndex(order: readonly Position[], position: Position): number {
  const index = order.indexOf(position);
  if (index === -1) throw new Error(`Position ${position} is not at this table`);
  return index;
}

/**
 * Index (0 or 1) of the player who acts first on the given street.
 * `positions[0]` and `positions[1]` are the two live seats.
 */
export function firstToAct(
  positions: readonly [Position, Position],
  tableSize: number,
  street: 'preflop' | 'postflop',
): 0 | 1 {
  const order = street === 'preflop' ? preflopOrder(tableSize) : postflopOrder(tableSize);
  const a = orderIndex(order, positions[0]);
  const b = orderIndex(order, positions[1]);
  return a < b ? 0 : 1;
}

/** Index of the player who acts first postflop — also the odd-chip winner on a split. */
export function inPositionIndex(
  positions: readonly [Position, Position],
  tableSize: number,
): 0 | 1 {
  return firstToAct(positions, tableSize, 'postflop') === 0 ? 1 : 0;
}
