import { useEffect, useMemo, useState } from 'react';
import {
  legalActions,
  oddsFacing,
  oddsLaid,
  sizingOptions,
  type Action,
  type HandView,
} from 'engine';
import { useAmounts } from '../display.js';
import { Console } from './GameWindow.js';
import { PotOddsLine } from './PotOddsLine.js';

interface Props {
  hand: HandView;
  onAct: (action: Action) => void;
  /** Name of whoever is to act, shown in the status corner. */
  actorName: string;
  /** Blocks the buttons while an action is being sent to the server. */
  disabled?: boolean;
}

/**
 * Presets set the size and the slider fine-tunes it; the coloured button
 * commits it. Nothing bets on a single click, which matters when the
 * difference between a min-raise and a shove is one mis-tap.
 *
 * Laid out as a client does it: a compact cluster in the bottom-right corner,
 * with the sizing controls stacked above the three decisions.
 */
export function ActionBar({ hand, onAct, actorName, disabled = false }: Props) {
  const amounts = useAmounts(hand.config.bigBlind);
  const legal = legalActions(hand);
  const opening = hand.currentBet === 0;

  const minTo = legal ? (opening ? legal.minBetTo : legal.minRaiseTo) : 0;
  const maxTo = legal?.maxTo ?? 0;
  const canAggress = legal?.types.includes(opening ? 'bet' : 'raise') ?? false;

  const [raiseTo, setRaiseTo] = useState(minTo);
  const [typed, setTyped] = useState<string | null>(null);

  // A new decision resets the size back to the minimum.
  const decision = `${hand.handNumber}:${hand.street}:${hand.events.length}:${hand.toAct}`;
  useEffect(() => {
    setRaiseTo(minTo);
    setTyped(null);
  }, [decision, minTo]);

  const sizes = useMemo(() => (legal ? sizingOptions(hand, legal) : []), [hand, legal]);

  const facing = legal && legal.callAmount > 0 ? oddsFacing(hand, legal.player) : null;
  const laying = canAggress ? oddsLaid(hand, legal!.player, raiseTo) : null;

  if (!legal) return null;

  const clamp = (value: number): number => Math.max(minTo, Math.min(maxTo, Math.round(value)));
  // Sizes are capped at the effective stack, so the deeper player can reach the
  // maximum while still having chips behind. Only call it all-in when it is.
  const me = hand.players[legal.player];
  const isAllIn = raiseTo >= me.committedThisStreet + me.stack;
  const callIsAllIn =
    legal.callAmount >= maxTo - hand.players[legal.player].committedThisStreet && legal.callAmount > 0;

  const commitTyped = (): void => {
    if (typed === null) return;
    const value = Number(typed);
    if (!Number.isNaN(value)) setRaiseTo(clamp(amounts.toChips(value)));
    setTyped(null);
  };

  const verb = opening ? 'Bet' : 'Raise';

  const status = (
    <>
      <span className="status-line">
        {actorName} to act — {hand.street}
      </span>
      {facing && (
        <span className="status-odds">
          <span className="subtle">To call</span> <PotOddsLine odds={facing} kind="facing" />
        </span>
      )}
    </>
  );

  const controls = (
    <div className="action-bar">
      {canAggress && (
        <div className="sizing">
          <div className="sizes">
            {laying && <PotOddsLine odds={laying} kind="laying" />}
            {sizes.map((size) => (
              <button
                key={`${size.label}-${size.to}`}
                type="button"
                className={raiseTo === size.to ? 'size selected' : 'size'}
                onClick={() => setRaiseTo(size.to)}
                disabled={disabled}
                title={`${verb} to ${amounts.format(size.to)}`}
              >
                {size.label}
              </button>
            ))}
            <button
              type="button"
              className={raiseTo === maxTo ? 'size selected' : 'size'}
              onClick={() => setRaiseTo(maxTo)}
              disabled={disabled}
              title="All-in for the effective stack"
            >
              Max
            </button>
          </div>

          <div className="slider-row">
            <input
              className="slider"
              type="range"
              min={minTo}
              max={maxTo}
              step={1}
              value={raiseTo}
              onChange={(event) => setRaiseTo(clamp(Number(event.target.value)))}
              disabled={disabled}
              aria-label={`${verb} size`}
            />
            <input
              className="amount"
              type="number"
              inputMode="decimal"
              step={amounts.inBigBlinds ? 0.5 : 1}
              value={typed ?? amounts.fromChips(raiseTo)}
              onChange={(event) => setTyped(event.target.value)}
              onBlur={commitTyped}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTyped();
              }}
              disabled={disabled}
              aria-label={`${verb} to`}
            />
          </div>
        </div>
      )}

      <div className="action-main">
        {legal.types.includes('fold') && (
          <button className="act fold" onClick={() => onAct({ type: 'fold' })} disabled={disabled}>
            Fold
          </button>
        )}

        {legal.types.includes('check') && (
          <button className="act call" onClick={() => onAct({ type: 'check' })} disabled={disabled}>
            Check
          </button>
        )}

        {legal.types.includes('call') && (
          <button className="act call" onClick={() => onAct({ type: 'call' })} disabled={disabled}>
            Call{' '}
            <span className="act-amount">
              {amounts.format(legal.callAmount)}
              {callIsAllIn && <span className="act-note">all-in</span>}
            </span>
          </button>
        )}

        {canAggress && (
          <button
            className="act raise"
            onClick={() => onAct({ type: opening ? 'bet' : 'raise', to: raiseTo })}
            disabled={disabled}
          >
            {isAllIn ? 'All-in' : opening ? 'Bet' : 'Raise to'}{' '}
            <span className="act-amount">{amounts.format(raiseTo)}</span>
          </button>
        )}
      </div>
    </div>
  );

  return <Console status={status} controls={controls} />;
}
