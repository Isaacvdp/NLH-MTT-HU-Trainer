import { POSITION_LABELS, settledPot, toBigBlinds, type HandState, type PlayerIndex } from 'engine';
import { chips, chipsWithBb } from '../format.js';
import { CardRow, PlayingCard } from './PlayingCard.js';

interface Props {
  hand: HandState;
  nameOfSeat: (seat: PlayerIndex) => string;
  /** Seats whose hole cards the viewer is allowed to see. */
  visibleSeats: PlayerIndex[];
}

export function TableView({ hand, nameOfSeat, visibleSeats }: Props) {
  const { bigBlind } = hand.config;
  // Chips already gathered in the middle; anything bet this street shows at the seat.
  const middle = settledPot(hand);

  return (
    <div className="felt">
      <Seat hand={hand} seat={0} nameOfSeat={nameOfSeat} visible={visibleSeats.includes(0)} />

      <div className="middle">
        <div className="pot">
          Pot {chips(middle)} <span>· {toBigBlinds(middle, bigBlind)}</span>
        </div>
        <div className="cards board">
          {[0, 1, 2, 3, 4].map((i) => (
            <PlayingCard key={i} card={hand.board[i] ?? null} />
          ))}
        </div>
      </div>

      <Seat hand={hand} seat={1} nameOfSeat={nameOfSeat} visible={visibleSeats.includes(1)} />
    </div>
  );
}

interface SeatProps {
  hand: HandState;
  seat: PlayerIndex;
  nameOfSeat: (seat: PlayerIndex) => string;
  visible: boolean;
}

function Seat({ hand, seat, nameOfSeat, visible }: SeatProps) {
  const player = hand.players[seat];
  const { bigBlind } = hand.config;
  const toAct = hand.toAct === seat;

  return (
    <div className={`seat${toAct ? ' to-act' : ''}${player.status === 'folded' ? ' folded' : ''}`}>
      <div className="seat-info">
        <div className="seat-name">
          <strong>{nameOfSeat(seat)}</strong>
          <span className="pos">{POSITION_LABELS[player.position]}</span>
          {player.status === 'all-in' && <span className="pos">ALL-IN</span>}
        </div>
        <div className="seat-stack">{chipsWithBb(player.stack, bigBlind)}</div>
      </div>

      <CardRow cards={player.holeCards} hidden={!visible} />

      <div className="seat-bet">
        {player.committedThisStreet > 0 ? chips(player.committedThisStreet) : ''}
      </div>
    </div>
  );
}
