/**
 * Where each seat sits around the oval.
 *
 * The whole table is drawn, not just the two live seats, because the folded
 * seats are where the dead money comes from — showing them is the clearest way
 * to explain why the pot starts at more than the two players put in.
 */

import { postflopOrder, type Position, type PlayerIndex, type SpotConfig } from 'engine';

export interface SeatSlot {
  position: Position;
  /** Percentage of the table box, for absolute positioning. */
  x: number;
  y: number;
  /** The live player in this seat, or `null` for a folded one. */
  player: PlayerIndex | null;
  /** Where this seat's chips sit, between the seat and the middle. */
  betX: number;
  betY: number;
}

/** How far out the seats sit, as a fraction of the table box. */
const SEAT_RADIUS_X = 0.4;
const SEAT_RADIUS_Y = 0.37;
/** Chips sit this fraction of the way back towards the middle. */
const BET_PULL = 0.55;

/**
 * Seats are laid out in physical table order — the order starting to the left
 * of the button, which is exactly the postflop acting order — and rotated so
 * that `heroSeat` sits at the bottom of the screen.
 */
export function seatSlots(config: SpotConfig, heroSeat: PlayerIndex = 0): SeatSlot[] {
  const order = postflopOrder(config.tableSize);
  const heroPosition = config.positions[heroSeat];

  // Rotate so the hero is first, then walk clockwise from the bottom.
  const start = order.indexOf(heroPosition);
  const rotated = [...order.slice(start), ...order.slice(0, start)];

  const step = 360 / rotated.length;

  return rotated.map((position, i) => {
    // 90 degrees is the bottom of the box; increasing the angle moves clockwise
    // on screen, because y grows downwards.
    const angle = ((90 + i * step) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x = 50 + SEAT_RADIUS_X * 100 * cos;
    const y = 50 + SEAT_RADIUS_Y * 100 * sin;

    const seat = config.positions.indexOf(position);
    return {
      position,
      x,
      y,
      player: seat === -1 ? null : (seat as PlayerIndex),
      betX: 50 + SEAT_RADIUS_X * 100 * cos * BET_PULL,
      betY: 50 + SEAT_RADIUS_Y * 100 * sin * BET_PULL,
    };
  });
}

/**
 * Chips a folded seat left behind: its blind, plus its ante when every seat
 * antes. This is the dead money, shown where it actually came from.
 */
export function deadChipsAt(position: Position, config: SpotConfig): number {
  let total = 0;
  if (position === 'SB') total += config.smallBlind;
  if (position === 'BB') total += config.bigBlind;

  if (config.anteType === 'per-player') total += config.ante;
  else if (config.anteType === 'bb' && position === 'BB') total += config.ante;

  return total;
}
