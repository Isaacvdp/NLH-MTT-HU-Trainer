import {
  MAX_TABLE_SIZE,
  MIN_TABLE_SIZE,
  POSITION_LABELS,
  isPositionAtTable,
  preflopOrder,
  presetsForTableSize,
  type AnteType,
  type Position,
  type Range,
} from 'engine';
import type { Settings } from '../hotseat.js';
import { defaultRangesFor, useRangeLibrary } from '../ranges.js';
import { RangeEditor } from './RangeEditor.js';

interface Props {
  settings: Settings;
  onChange: (update: Partial<Settings>) => void;
  onStart: () => void;
  error: string | null;
  /** Text on the confirm button. Defaults to dealing a hot-seat hand. */
  startLabel?: string;
  busy?: boolean;
  /** Hide the options that only apply when both players share one screen. */
  showLocalOptions?: boolean;
}

const ANTE_LABELS: Record<AnteType, string> = {
  none: 'No ante',
  bb: 'Big blind ante',
  'per-player': 'Ante per player',
};

export function SetupScreen({
  settings,
  onChange,
  onStart,
  error,
  startLabel = 'Deal first hand',
  busy = false,
  showLocalOptions = true,
}: Props) {
  const library = useRangeLibrary();
  const seats = preflopOrder(settings.tableSize);
  const presets = presetsForTableSize(settings.tableSize);
  const activePreset = presets.find(
    (preset) =>
      preset.positions[0] === settings.positions[0] && preset.positions[1] === settings.positions[1],
  );

  /** A seat's range follows its position, preferring one you have saved. */
  const withRanges = (positions: [Position, Position]): Partial<Settings> => ({
    positions,
    ranges: defaultRangesFor(library, positions),
  });

  const setTableSize = (tableSize: number): void => {
    // Keep the spot valid: fall back to the button (or small blind) vs the big blind.
    if (!settings.positions.every((position) => isPositionAtTable(position, tableSize))) {
      const positions: [Position, Position] = tableSize === 2 ? ['SB', 'BB'] : ['BTN', 'BB'];
      onChange({ tableSize, ...withRanges(positions) });
      return;
    }
    onChange({ tableSize });
  };

  const setPosition = (seat: 0 | 1, position: Position): void => {
    const positions: [Position, Position] = [...settings.positions];
    positions[seat] = position;
    if (positions[0] === positions[1]) {
      // Swap rather than reject, so the picker never gets stuck.
      positions[seat === 0 ? 1 : 0] = settings.positions[seat];
    }
    onChange(withRanges(positions));
  };

  const setRange = (seat: 0 | 1, range: Range): void => {
    const ranges: [Range, Range] = [...settings.ranges];
    ranges[seat] = range;
    onChange({ ranges });
  };

  const setBigBlind = (bigBlind: number): void => {
    if (!Number.isFinite(bigBlind) || bigBlind < 2) return;
    onChange({
      bigBlind,
      smallBlind: Math.round(bigBlind / 2),
      ante: settings.anteType === 'bb' ? bigBlind : settings.ante,
    });
  };

  const setAnteType = (anteType: AnteType): void => {
    onChange({
      anteType,
      ante: anteType === 'bb' ? settings.bigBlind : Math.max(1, Math.round(settings.bigBlind / 8)),
    });
  };

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <section className="panel">
        <h2>Spot</h2>
        <div className="grid">
          <label className="field">
            <span>Preset</span>
            <select
              value={activePreset?.id ?? 'custom'}
              onChange={(event) => {
                const preset = presets.find((item) => item.id === event.target.value);
                if (preset) onChange({ positions: [...preset.positions] });
              }}
            >
              {!activePreset && <option value="custom">Custom</option>}
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Table size</span>
            <select value={settings.tableSize} onChange={(event) => setTableSize(Number(event.target.value))}>
              {Array.from({ length: MAX_TABLE_SIZE - MIN_TABLE_SIZE + 1 }, (_, i) => MIN_TABLE_SIZE + i).map(
                (size) => (
                  <option key={size} value={size}>
                    {size}-handed
                  </option>
                ),
              )}
            </select>
          </label>

          {([0, 1] as const).map((seat) => (
            <label className="field" key={seat}>
              <span>{seat === 0 ? 'Seat 1' : 'Seat 2'}</span>
              <select
                value={settings.positions[seat]}
                onChange={(event) => setPosition(seat, event.target.value as Position)}
              >
                {seats.map((position) => (
                  <option key={position} value={position}>
                    {POSITION_LABELS[position]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {activePreset && <p className="subtle">{activePreset.description}</p>}
      </section>

      <section className="panel">
        <h2>Blinds and antes</h2>
        <div className="grid">
          <label className="field">
            <span>Big blind</span>
            <input
              type="number"
              min={2}
              step={1}
              value={settings.bigBlind}
              onChange={(event) => setBigBlind(Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span>Small blind</span>
            <input
              type="number"
              min={0}
              step={1}
              value={settings.smallBlind}
              onChange={(event) => onChange({ smallBlind: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span>Ante type</span>
            <select value={settings.anteType} onChange={(event) => setAnteType(event.target.value as AnteType)}>
              {(Object.keys(ANTE_LABELS) as AnteType[]).map((type) => (
                <option key={type} value={type}>
                  {ANTE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          {settings.anteType !== 'none' && (
            <label className="field">
              <span>Ante size</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.ante}
                onChange={(event) => onChange({ ante: Number(event.target.value) })}
              />
            </label>
          )}
        </div>
        <p className="subtle">
          {settings.anteType === 'bb'
            ? 'The big blind posts one ante for the table, as dead money.'
            : settings.anteType === 'per-player'
              ? `All ${settings.tableSize} seats ante; the folded ones leave theirs behind.`
              : 'Only the folded blinds are dead money.'}
        </p>
      </section>

      <section className="panel">
        <h2>Stacks</h2>
        <div className="grid">
          <label className="field">
            <span>Stack size</span>
            <select
              value={settings.stackMode}
              onChange={(event) => onChange({ stackMode: event.target.value as Settings['stackMode'] })}
            >
              <option value="fixed">Fixed</option>
              <option value="random">Random range</option>
            </select>
          </label>

          {settings.stackMode === 'fixed' ? (
            <label className="field">
              <span>Big blinds</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.stackBb}
                onChange={(event) => onChange({ stackBb: Number(event.target.value) })}
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>Minimum (bb)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={settings.minStackBb}
                  onChange={(event) => onChange({ minStackBb: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                <span>Maximum (bb)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={settings.maxStackBb}
                  onChange={(event) => onChange({ maxStackBb: Number(event.target.value) })}
                />
              </label>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Hands dealt</h2>
        <p className="subtle">
          Each seat is dealt only from its range. Approximate opening ranges, not solver
          exports — edit them freely.
        </p>
        <div className="range-pair">
          {([0, 1] as const).map((seat) => (
            <RangeEditor
              key={seat}
              position={settings.positions[seat]}
              range={settings.ranges[seat]}
              onChange={(range) => setRange(seat, range)}
              otherPosition={settings.positions[seat === 0 ? 1 : 0]}
              onCopyToOther={(range) => setRange(seat === 0 ? 1 : 0, range)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Table rules</h2>
        <div className="grid">
          <Toggle
            checked={settings.swapSeatsEachHand}
            onChange={(swapSeatsEachHand) => onChange({ swapSeatsEachHand })}
            label="Swap seats each hand"
            hint="Take turns being the aggressor."
          />
          <Toggle
            checked={settings.carryStacksOver}
            onChange={(carryStacksOver) => onChange({ carryStacksOver })}
            label="Carry stacks over"
            hint="Off means stacks reset every hand."
          />
          <Toggle
            checked={settings.revealHandsAfterHand}
            onChange={(revealHandsAfterHand) => onChange({ revealHandsAfterHand })}
            label="Reveal hands after each hand"
            hint="Show both holdings even when somebody folded."
          />
          {showLocalOptions && (
            <Toggle
              checked={settings.hideWaitingPlayer}
              onChange={(hideWaitingPlayer) => onChange({ hideWaitingPlayer })}
              label="Hide the waiting player's cards"
              hint="For passing one device back and forth."
            />
          )}
        </div>

        <div className="grid" style={{ marginTop: '1rem' }}>
          {([0, 1] as const).map((player) => (
            <label className="field" key={player}>
              <span>Player {player + 1} name</span>
              <input
                value={settings.playerNames[player]}
                onChange={(event) => {
                  const playerNames: [string, string] = [...settings.playerNames];
                  playerNames[player] = event.target.value;
                  onChange({ playerNames });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <div className="row">
        <button className="primary" onClick={onStart} disabled={busy}>
          {startLabel}
        </button>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}

function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  );
}
