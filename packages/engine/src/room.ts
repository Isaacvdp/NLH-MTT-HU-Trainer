/**
 * Room settings: everything that describes how a session is played, as opposed
 * to `SpotConfig`, which describes one hand.
 *
 * These cross the wire from an untrusted client into an Edge Function, so
 * `parseRoomSettings` validates rather than trusts, and is the only supported
 * way to turn unknown JSON into settings.
 */

import type { RandomInt } from './cards.js';
import { MAX_TABLE_SIZE, MIN_TABLE_SIZE, isPositionAtTable, type Position } from './positions.js';
import { defaultRangeFor, parseRangeArray, type Range } from './range.js';
import { validateSpotConfig } from './setup.js';
import type { AnteType, SpotConfig } from './types.js';

export type StackMode = 'fixed' | 'random';

export interface RoomSettings {
  tableSize: number;
  /** The two live seats, in the order they are seated. */
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
  playerNames: [string, string];
  /**
   * The starting hands each seat is dealt from, aligned with `positions`. An
   * empty range means any two cards.
   */
  ranges: [Range, Range];
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
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
  playerNames: ['Player 1', 'Player 2'],
  ranges: [defaultRangeFor('BTN'), defaultRangeFor('BB')],
};

/** Guard rails so a hostile or buggy client cannot ask for an absurd table. */
const MAX_BLIND = 100_000_000;
const MAX_STACK_BB = 100_000;
const MAX_NAME_LENGTH = 40;

const ANTE_TYPES: AnteType[] = ['none', 'bb', 'per-player'];
const STACK_MODES: StackMode[] = ['fixed', 'random'];

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

function fail(message: string): never {
  throw new SettingsError(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('Settings must be an object');
  }
  return value as Record<string, unknown>;
}

function intField(source: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${key} must be a whole number`);
  if (value < min || value > max) fail(`${key} must be between ${min} and ${max}`);
  return value;
}

function boolField(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') fail(`${key} must be true or false`);
  return value;
}

function enumField<T extends string>(source: Record<string, unknown>, key: string, allowed: T[]): T {
  const value = source[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function nameField(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') fail('Player names must be text');
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

/** Validates unknown JSON and returns settings that are safe to store and use. */
export function parseRoomSettings(input: unknown): RoomSettings {
  const source = asRecord(input);

  const tableSize = intField(source, 'tableSize', MIN_TABLE_SIZE, MAX_TABLE_SIZE);

  const rawPositions = source['positions'];
  if (!Array.isArray(rawPositions) || rawPositions.length !== 2) {
    fail('positions must be two seats');
  }
  const positions = rawPositions.map((position) => {
    if (typeof position !== 'string' || !isPositionAtTable(position as Position, tableSize)) {
      fail(`${String(position)} is not a seat at a ${tableSize}-handed table`);
    }
    return position as Position;
  }) as [Position, Position];
  if (positions[0] === positions[1]) fail('The two seats must be different');

  const bigBlind = intField(source, 'bigBlind', 2, MAX_BLIND);
  const smallBlind = intField(source, 'smallBlind', 0, bigBlind);
  const anteType = enumField(source, 'anteType', ANTE_TYPES);
  const ante = anteType === 'none' ? 0 : intField(source, 'ante', 1, MAX_BLIND);

  const stackMode = enumField(source, 'stackMode', STACK_MODES);
  const stackBb = intField(source, 'stackBb', 1, MAX_STACK_BB);
  const minStackBb = intField(source, 'minStackBb', 1, MAX_STACK_BB);
  const maxStackBb = intField(source, 'maxStackBb', 1, MAX_STACK_BB);
  if (minStackBb > maxStackBb) fail('minStackBb must not be larger than maxStackBb');

  const rawNames = source['playerNames'];
  const names = Array.isArray(rawNames) ? rawNames : [];
  const playerNames: [string, string] = [
    nameField(names[0], 'Player 1'),
    nameField(names[1], 'Player 2'),
  ];

  const settings: RoomSettings = {
    tableSize,
    positions,
    smallBlind,
    bigBlind,
    anteType,
    ante,
    stackMode,
    stackBb,
    minStackBb,
    maxStackBb,
    swapSeatsEachHand: boolField(source, 'swapSeatsEachHand'),
    revealHandsAfterHand: boolField(source, 'revealHandsAfterHand'),
    carryStacksOver: boolField(source, 'carryStacksOver'),
    playerNames,
    ranges: parseRanges(source['ranges'], positions),
  };

  // Catch anything the engine itself would reject, using the smallest stack the
  // settings can produce.
  validateSpotConfig(configForSettings(settings, [bigBlind, bigBlind]));
  return settings;
}

/** Reads the two ranges, falling back to each seat's default when absent. */
function parseRanges(input: unknown, positions: [Position, Position]): [Range, Range] {
  if (input === undefined || input === null) {
    return [defaultRangeFor(positions[0]), defaultRangeFor(positions[1])];
  }
  if (!Array.isArray(input) || input.length !== 2) fail('ranges must be two lists of hands');
  return [parseRangeArray(input[0]), parseRangeArray(input[1])];
}

/** Builds the config for one hand from the room settings and the two stacks. */
export function configForSettings(settings: RoomSettings, stacks: [number, number]): SpotConfig {
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

/** A starting stack in chips, fixed or drawn from the configured range. */
export function startingStackFor(settings: RoomSettings, randomInt: RandomInt): number {
  if (settings.stackMode === 'fixed') {
    return Math.max(1, Math.round(settings.stackBb * settings.bigBlind));
  }
  const min = Math.round(settings.minStackBb * settings.bigBlind);
  const max = Math.round(settings.maxStackBb * settings.bigBlind);
  return Math.max(1, min + randomInt(max - min + 1));
}

/**
 * Seating for the next hand. `seatOf[i]` is the person sitting in engine seat
 * `i`, so swapping seats is just reversing it.
 */
export function nextSeatOf(seatOf: [0 | 1, 0 | 1], settings: RoomSettings): [0 | 1, 0 | 1] {
  return settings.swapSeatsEachHand ? [seatOf[1], seatOf[0]] : [seatOf[0], seatOf[1]];
}

/**
 * Stacks for the next hand, indexed by seat. `bankroll` is indexed by person,
 * so this also maps one to the other.
 */
export function stacksForNextHand(
  settings: RoomSettings,
  seatOf: [0 | 1, 0 | 1],
  bankroll: [number, number],
  randomInt: RandomInt,
  isFirstHand: boolean,
): [number, number] {
  if (isFirstHand || !settings.carryStacksOver) {
    return [startingStackFor(settings, randomInt), startingStackFor(settings, randomInt)];
  }
  return [bankroll[seatOf[0]], bankroll[seatOf[1]]];
}
