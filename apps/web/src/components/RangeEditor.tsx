import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POSITION_LABELS,
  allHandClasses,
  gridCell,
  isPair,
  isSuited,
  rangeCombos,
  rangePercent,
  topPercentRange,
  type HandClass,
  type Position,
  type Range,
} from 'engine';
import { useRangeLibrary } from '../ranges.js';

interface Props {
  position: Position;
  range: Range;
  onChange: (range: Range) => void;
  /** The seat across the table, for copying a range over to it. */
  otherPosition: Position;
  onCopyToOther: (range: Range) => void;
}

/**
 * The 13x13 grid everyone reads ranges in: pairs down the diagonal, suited
 * above it, offsuit below. Click or drag to paint cells in or out.
 */
export function RangeEditor({ position, range, onChange, otherPosition, onCopyToOther }: Props) {
  const library = useRangeLibrary();
  const selected = new Set(range);
  const percent = rangePercent(range);

  // Dragging paints whatever the first cell became, so a sweep is consistent.
  const painting = useRef<boolean | null>(null);
  const [flash, setFlash] = useState<'saved' | 'copied' | null>(null);

  const stopPainting = useCallback(() => {
    painting.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, [stopPainting]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(timer);
  }, [flash]);

  const paint = (handClass: HandClass, turnOn: boolean): void => {
    const next = new Set(selected);
    if (turnOn) next.add(handClass);
    else next.delete(handClass);
    onChange(allHandClasses().filter((item) => next.has(item)));
  };

  const [topPercent, setTopPercent] = useState(() => Math.round(percent));

  return (
    <div className="range-editor">
      <div className="range-head">
        <span className="range-title">
          {POSITION_LABELS[position]}
          {library.hasSaved(position) && (
            <span className="saved-tag" title="Using a range you saved">
              saved
            </span>
          )}
        </span>
        <span className="range-size">
          {percent.toFixed(1)}% · {rangeCombos(range)} combos
        </span>
      </div>

      <div
        className="range-grid"
        onPointerLeave={stopPainting}
        role="group"
        aria-label={`${POSITION_LABELS[position]} range`}
      >
        {Array.from({ length: 13 }, (_, row) =>
          Array.from({ length: 13 }, (_, column) => {
            const handClass = gridCell(row, column);
            const on = selected.has(handClass);
            const kind = isPair(handClass) ? 'pair' : isSuited(handClass) ? 'suited' : 'offsuit';
            return (
              <button
                key={handClass}
                type="button"
                className={`cell ${kind}${on ? ' on' : ''}`}
                aria-pressed={on}
                title={handClass}
                onPointerDown={(event) => {
                  event.preventDefault();
                  painting.current = !on;
                  paint(handClass, !on);
                }}
                onPointerEnter={() => {
                  if (painting.current !== null) paint(handClass, painting.current);
                }}
              >
                {handClass}
              </button>
            );
          }),
        )}
      </div>

      <label className="range-slider">
        <span>Top</span>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          step={1}
          value={topPercent}
          onChange={(event) => {
            const value = Number(event.target.value);
            setTopPercent(value);
            onChange(topPercentRange(value));
          }}
          aria-label={`Top percent of hands for ${POSITION_LABELS[position]}`}
        />
        <span className="range-percent">{topPercent}%</span>
      </label>

      <div className="range-tools">
        <button
          type="button"
          className="size"
          onClick={() => {
            library.save(position, range);
            setFlash('saved');
          }}
          title={`Use this as your default for ${POSITION_LABELS[position]} from now on`}
        >
          {flash === 'saved' ? 'Saved' : 'Save'}
        </button>

        <button
          type="button"
          className="size"
          onClick={() => {
            onCopyToOther(range);
            setFlash('copied');
          }}
          title={`Give ${POSITION_LABELS[otherPosition]} this range too`}
        >
          {flash === 'copied' ? 'Copied' : `Copy to ${POSITION_LABELS[otherPosition]}`}
        </button>

        <button
          type="button"
          className="size"
          onClick={() => onChange(library.defaultFor(position))}
          title="Load this seat's default range"
        >
          Default
        </button>

        <button type="button" className="size" onClick={() => onChange(allHandClasses())}>
          Any two
        </button>

        <button type="button" className="size" onClick={() => onChange([])}>
          Clear
        </button>

        {library.hasSaved(position) && (
          <button
            type="button"
            className="size"
            onClick={() => library.forget(position)}
            title="Go back to the built-in range for this seat"
          >
            Forget saved
          </button>
        )}
      </div>
    </div>
  );
}
