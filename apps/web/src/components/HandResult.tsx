import type { HandView, PlayerIndex } from 'engine';
import { useAmounts } from '../display.js';

interface Props {
  hand: HandView;
  nameOfSeat: (seat: PlayerIndex) => string;
}

/** How a finished hand ended: who won what, and where the stacks landed. */
export function HandResult({ hand, nameOfSeat }: Props) {
  const amounts = useAmounts(hand.config.bigBlind);
  const result = hand.result;
  if (!result) return null;

  const headline =
    result.winners.length === 2
      ? 'Split pot'
      : `${nameOfSeat(result.winners[0]!)} wins ${amounts.format(result.awarded[result.winners[0]!])}`;

  return (
    <div className="result">
      <strong>{headline}</strong>
      {result.hands?.map((value, seat) => (
        <div key={seat} className="subtle">
          {nameOfSeat(seat as PlayerIndex)}: {value.description}
        </div>
      ))}
      <div className="net">
        {([0, 1] as const).map((seat) => (
          <span key={seat} style={{ marginRight: '1rem' }}>
            {nameOfSeat(seat)} {amounts.signed(result.net[seat])} →{' '}
            {amounts.format(hand.players[seat].stack)}
          </span>
        ))}
      </div>
    </div>
  );
}
