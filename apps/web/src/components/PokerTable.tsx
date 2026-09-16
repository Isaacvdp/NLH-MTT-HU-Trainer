import { useEffect, useRef, useState } from 'react';
import {
  POSITION_LABELS,
  buttonPosition,
  type HandView,
  type PlayerIndex,
} from 'engine';
import { useAmounts } from '../display.js';
import { deadChipsAt, seatSlots, type SeatSlot } from '../tableLayout.js';
import { CardRow, PlayingCard } from './PlayingCard.js';

interface Props {
  hand: HandView;
  nameOfSeat: (seat: PlayerIndex) => string;
  /** Seats whose hole cards the viewer is allowed to see. */
  visibleSeats: PlayerIndex[];
  /** Seat to place at the bottom of the screen. */
  heroSeat?: PlayerIndex;
}

export function PokerTable({ hand, nameOfSeat, visibleSeats, heroSeat = 0 }: Props) {
  const amounts = useAmounts(hand.config.bigBlind);
  const slots = seatSlots(hand.config, heroSeat);
  const button = buttonPosition(hand.config.tableSize);

  return (
    <div className="table-wrap">
      <div className="table">
        <div className="felt" />

        <div className="middle">
          {/* Once the pot has been pushed out there is nothing to count. */}
          <div className="pot" aria-label="pot" style={{ visibility: hand.complete ? 'hidden' : 'visible' }}>
            <span className="pot-label">Pot</span> <PotAmount amount={hand.pot} format={amounts.format} />
          </div>
          <div className="cards board">
            {[0, 1, 2, 3, 4].map((i) => (
              <PlayingCard
                key={hand.board[i] ?? `empty-${i}`}
                card={hand.board[i] ?? null}
                size="board"
                dealIndex={i < 3 ? i : 0}
              />
            ))}
          </div>
        </div>

        {slots.map((slot) =>
          slot.player === null ? (
            <FoldedSeat key={slot.position} slot={slot} hand={hand} isButton={slot.position === button} />
          ) : (
            <LiveSeat
              key={slot.position}
              slot={slot}
              player={slot.player}
              hand={hand}
              name={nameOfSeat(slot.player)}
              visible={visibleSeats.includes(slot.player)}
              isHero={slot.player === heroSeat}
              isButton={slot.position === button}
              format={amounts.format}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The whole pot — dead money, antes and the bets still in front of the
 * players — the way a client's pot counter reads. Nudged when it changes, so
 * chips arriving is noticeable.
 */
function PotAmount({ amount, format }: { amount: number; format: (n: number) => string }) {
  const [bumped, setBumped] = useState(false);
  const previous = useRef(amount);

  useEffect(() => {
    if (previous.current === amount) return;
    previous.current = amount;
    setBumped(true);
    const timer = setTimeout(() => setBumped(false), 400);
    return () => clearTimeout(timer);
  }, [amount]);

  return <strong className={bumped ? 'pot-value bump' : 'pot-value'}>{format(amount)}</strong>;
}

interface LiveSeatProps {
  slot: SeatSlot;
  player: PlayerIndex;
  hand: HandView;
  name: string;
  visible: boolean;
  /** The viewer's own seat, drawn at the bottom with larger cards. */
  isHero: boolean;
  isButton: boolean;
  format: (n: number) => string;
}

function LiveSeat({ slot, player, hand, name, visible, isHero, isButton, format }: LiveSeatProps) {
  const state = hand.players[player];
  const toAct = hand.toAct === player;
  // Once the hand is over the pot has been pushed to the winner, so what they
  // won sits in front of them where their bet used to be.
  const won = hand.complete ? (hand.result?.awarded[player] ?? 0) : 0;
  const classes = ['seat', isHero && 'hero', toAct && 'to-act', state.status === 'folded' && 'folded']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="seat-slot" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
        {state.status !== 'folded' && (
          <div className="seat-cards">
            <CardRow cards={state.holeCards} hidden={!visible} size={isHero ? 'hero' : 'seat'} />
          </div>
        )}

        <div className={classes}>
          <div className="seat-pos">
            {POSITION_LABELS[state.position]}
            {isButton && <span className="dealer" aria-label="dealer button">D</span>}
          </div>
          <div className="seat-name">{name}</div>
          <div className="seat-stack">
            {state.status === 'all-in' && state.stack === 0 ? 'ALL-IN' : format(state.stack)}
          </div>
        </div>
      </div>

      {state.committedThisStreet > 0 && (
        <Chip
          amount={state.committedThisStreet}
          x={slot.betX}
          y={slot.betY}
          format={format}
        />
      )}

      {won > 0 && <Chip amount={won} x={slot.betX} y={slot.betY} kind="won" format={format} />}
    </>
  );
}

function FoldedSeat({ slot, hand, isButton }: { slot: SeatSlot; hand: HandView; isButton: boolean }) {
  const amounts = useAmounts(hand.config.bigBlind);
  // Dead money is swept into the pot when the preflop betting closes, exactly
  // like the live players' bets, so the chip only belongs on the table preflop.
  const dead =
    hand.street === 'preflop' && !hand.complete ? deadChipsAt(slot.position, hand.config) : 0;

  return (
    <>
      <div className="seat-slot" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
        <div className="seat dead-seat">
          <div className="seat-pos">
            {POSITION_LABELS[slot.position]}
            {isButton && <span className="dealer" aria-label="dealer button">D</span>}
          </div>
          <div className="seat-name">folded</div>
        </div>
      </div>

      {dead > 0 && (
        <Chip amount={dead} x={slot.betX} y={slot.betY} kind="dead" format={amounts.format} />
      )}
    </>
  );
}

interface ChipProps {
  amount: number;
  x: number;
  y: number;
  /** A live bet, dead money left by a folded seat, or a pot just won. */
  kind?: 'bet' | 'dead' | 'won';
  format: (n: number) => string;
}

const CHIP_TITLES: Record<NonNullable<ChipProps['kind']>, string | undefined> = {
  bet: undefined,
  dead: 'Dead money from a folded seat',
  won: 'Won this hand',
};

function Chip({ amount, x, y, kind = 'bet', format }: ChipProps) {
  return (
    <div
      className={kind === 'bet' ? 'chip' : `chip ${kind}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      title={CHIP_TITLES[kind]}
    >
      {kind === 'won' ? `+${format(amount)}` : format(amount)}
    </div>
  );
}
