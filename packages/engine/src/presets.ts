import type { Position } from './positions.js';
import { isPositionAtTable, POSITION_LABELS } from './positions.js';
import type { AnteType, SpotConfig } from './types.js';

export interface SpotPreset {
  id: string;
  label: string;
  positions: [Position, Position];
  /** Smallest table this spot exists at. */
  minTableSize: number;
  description: string;
}

export const SPOT_PRESETS: SpotPreset[] = [
  {
    id: 'btn-vs-bb',
    label: 'BTN vs BB',
    positions: ['BTN', 'BB'],
    minTableSize: 3,
    description: 'Button opens, big blind defends. The small blind is dead money.',
  },
  {
    id: 'sb-vs-bb',
    label: 'SB vs BB',
    positions: ['SB', 'BB'],
    minTableSize: 2,
    description: 'Blind versus blind. The small blind acts first on every street.',
  },
  {
    id: 'co-vs-bb',
    label: 'CO vs BB',
    positions: ['CO', 'BB'],
    minTableSize: 4,
    description: 'Cutoff opens, big blind defends. Both blinds behind are dead money.',
  },
  {
    id: 'hj-vs-bb',
    label: 'HJ vs BB',
    positions: ['HJ', 'BB'],
    minTableSize: 5,
    description: 'Hijack opens, big blind defends.',
  },
  {
    id: 'lj-vs-bb',
    label: 'LJ vs BB',
    positions: ['LJ', 'BB'],
    minTableSize: 7,
    description: 'Lojack opens, big blind defends.',
  },
  {
    id: 'utg-vs-bb',
    label: 'UTG vs BB',
    positions: ['UTG', 'BB'],
    minTableSize: 6,
    description: 'Under the gun opens, big blind defends.',
  },
  {
    id: 'btn-vs-sb',
    label: 'BTN vs SB',
    positions: ['BTN', 'SB'],
    minTableSize: 3,
    description: 'Button opens, small blind defends. The big blind is dead money.',
  },
  {
    id: 'co-vs-btn',
    label: 'CO vs BTN',
    positions: ['CO', 'BTN'],
    minTableSize: 4,
    description: 'Cutoff opens, button plays back. Both blinds are dead money.',
  },
];

export function presetById(id: string): SpotPreset | undefined {
  return SPOT_PRESETS.find((preset) => preset.id === id);
}

export function presetsForTableSize(tableSize: number): SpotPreset[] {
  return SPOT_PRESETS.filter(
    (preset) =>
      tableSize >= preset.minTableSize &&
      preset.positions.every((position) => isPositionAtTable(position, tableSize)),
  );
}

export function spotLabel(config: SpotConfig): string {
  const [a, b] = config.positions;
  return `${POSITION_LABELS[a]} vs ${POSITION_LABELS[b]} (${config.tableSize}-handed)`;
}

export interface BuildSpotOptions {
  tableSize: number;
  positions: [Position, Position];
  bigBlind: number;
  smallBlind?: number;
  anteType?: AnteType;
  ante?: number;
  stacks: [number, number];
}

/** Convenience builder that fills in the usual defaults (half-blind SB, BB ante). */
export function buildSpot(options: BuildSpotOptions): SpotConfig {
  const bigBlind = options.bigBlind;
  const anteType = options.anteType ?? 'none';
  const defaultAnte = anteType === 'bb' ? bigBlind : Math.round(bigBlind / 8);
  return {
    tableSize: options.tableSize,
    smallBlind: options.smallBlind ?? Math.round(bigBlind / 2),
    bigBlind,
    anteType,
    ante: anteType === 'none' ? 0 : (options.ante ?? Math.max(1, defaultAnte)),
    positions: options.positions,
    stacks: options.stacks,
  };
}

/** Random starting stack in chips, from a big-blind range (inclusive). */
export function randomStack(
  minBb: number,
  maxBb: number,
  bigBlind: number,
  randomInt: (maxExclusive: number) => number,
): number {
  if (minBb > maxBb) throw new Error('minBb must not exceed maxBb');
  const min = Math.round(minBb * bigBlind);
  const max = Math.round(maxBb * bigBlind);
  return min + randomInt(max - min + 1);
}
