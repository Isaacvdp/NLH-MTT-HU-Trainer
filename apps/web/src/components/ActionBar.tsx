import { useEffect, useState } from 'react';
import { legalActions, sizingOptions, toBigBlinds, type Action, type HandView } from 'engine';
import { chips } from '../format.js';

interface Props {
  hand: HandView;
  onAct: (action: Action) => void;
  /** Name of whoever is to act, shown above the buttons. */
  actorName: string;
  /** Blocks the buttons while an action is being sent to the server. */
  disabled?: boolean;
}

export function ActionBar({ hand, onAct, actorName, disabled = false }: Props) {
  const legal = legalActions(hand);
  const opening = hand.currentBet === 0;
  const [custom, setCustom] = useState('');

  // Clear the custom box whenever the decision changes.
  useEffect(() => {
    setCustom('');
  }, [hand.toAct, hand.street, hand.currentBet, hand.events.length]);

  if (!legal) return null;

  const sizes = sizingOptions(hand, legal);
  const canAggress = legal.types.includes(opening ? 'bet' : 'raise');
  const minTo = opening ? legal.minBetTo : legal.minRaiseTo;
  const customTo = Number(custom);
  const customValid =
    Number.isInteger(customTo) && customTo >= minTo && customTo <= legal.maxTo && custom.trim() !== '';

  const aggress = (to: number): void => onAct({ type: opening ? 'bet' : 'raise', to });

  return (
    <div className="action-bar">
      <div className="subtle">
        {actorName} to act — {hand.street}
      </div>

      <div className="action-main">
        {legal.types.includes('fold') && (
          <button onClick={() => onAct({ type: 'fold' })} disabled={disabled}>
            Fold
          </button>
        )}
        {legal.types.includes('check') && (
          <button onClick={() => onAct({ type: 'check' })} disabled={disabled}>
            Check
          </button>
        )}
        {legal.types.includes('call') && (
          <button onClick={() => onAct({ type: 'call' })} disabled={disabled}>
            Call {chips(legal.callAmount)}
            {legal.callAmount >= legal.maxTo - hand.players[legal.player].committedThisStreet
              ? ' (all-in)'
              : ''}
          </button>
        )}
      </div>

      {canAggress && (
        <>
          <div className="sizes">
            {sizes.map((size) => (
              <button
                key={`${size.label}-${size.to}`}
                className={customTo === size.to ? 'selected' : undefined}
                onClick={() => aggress(size.to)}
                disabled={disabled}
                title={`${opening ? 'Bet' : 'Raise'} to ${chips(size.to)} — ${chips(size.amount)} more`}
              >
                {size.label} · {chips(size.to)}
              </button>
            ))}
          </div>

          <div className="custom">
            <input
              type="number"
              inputMode="numeric"
              min={minTo}
              max={legal.maxTo}
              step={1}
              placeholder={`${chips(minTo)}–${chips(legal.maxTo)}`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && customValid) aggress(customTo);
              }}
              aria-label={`${opening ? 'Bet' : 'Raise'} to`}
            />
            <button disabled={disabled || !customValid} onClick={() => aggress(customTo)}>
              {opening ? 'Bet' : 'Raise'} to
            </button>
            <span className="subtle">
              min {chips(minTo)} · max {chips(legal.maxTo)} ({toBigBlinds(legal.maxTo, hand.config.bigBlind)})
            </span>
          </div>
        </>
      )}
    </div>
  );
}
