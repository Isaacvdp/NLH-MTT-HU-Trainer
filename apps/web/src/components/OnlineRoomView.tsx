import { useEffect, useMemo, useState } from 'react';
import { POSITION_LABELS, type PlayerIndex, type PublicHandState } from 'engine';
import { useOnlineRoom } from '../supabase/room.js';
import { ActionBar } from './ActionBar.js';
import { ActionLog } from './ActionLog.js';
import { HandResult } from './HandResult.js';
import { HistoryPanel } from './HistoryPanel.js';
import { PokerTable } from './PokerTable.js';
import type { FinishedHand } from '../hotseat.js';

interface Props {
  roomId: string;
  code: string;
  onLeave: () => void;
}

export function OnlineRoomView({ roomId, code, onLeave }: Props) {
  const room = useOnlineRoom(roomId);
  const [copied, setCopied] = useState(false);
  const [finished, setFinished] = useState<FinishedHand[]>([]);

  const shareUrl = `${window.location.origin}/room/${code}`;

  const names = useMemo((): [string, string] => {
    if (!room.room) return ['Player 1', 'Player 2'];
    const { playerNames } = room.room.settings;
    const seatOf = room.room.seat_of;
    return [playerNames[seatOf[0]] ?? 'Player 1', playerNames[seatOf[1]] ?? 'Player 2'];
  }, [room.room]);

  /** The published state with our own cards slotted back in. */
  const hand = useMemo((): PublicHandState | null => {
    if (!room.hand) return null;
    if (room.mySeat === null || !room.myCards) return room.hand;
    const players = [...room.hand.players] as PublicHandState['players'];
    if (players[room.mySeat].holeCards === null) {
      players[room.mySeat] = { ...players[room.mySeat], holeCards: room.myCards };
    }
    return { ...room.hand, players };
  }, [room.hand, room.mySeat, room.myCards]);

  // Keep finished hands around for the history panel.
  useEffect(() => {
    if (!hand?.complete) return;
    setFinished((current) =>
      current.some((entry) => entry.hand.handNumber === hand.handNumber)
        ? current
        : [{ hand, names }, ...current],
    );
  }, [hand, names]);

  if (room.loading) {
    return <p className="subtle">Connecting…</p>;
  }

  if (!room.room) {
    return (
      <div className="stack">
        <div className="error">{room.error ?? 'That room could not be opened.'}</div>
        <div className="row">
          <button onClick={onLeave}>Back</button>
        </div>
      </div>
    );
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const waiting = !room.room.guest_id;
  const canDeal = !waiting && (!hand || hand.complete);

  return (
    <div className="stack">
      <section className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ marginBottom: '0.3rem' }}>
              Room {code} {room.myPerson === 0 ? '(you are the host)' : ''}
            </h2>
            <div className="subtle">
              {room.live ? 'Live' : 'Reconnecting — updates may lag a moment'}
              {room.room.hand_number > 0 && ` · hand #${room.room.hand_number}`}
            </div>
          </div>
          <div className="row">
            <button onClick={() => void copy()}>{copied ? 'Link copied' : 'Copy invite link'}</button>
            <button onClick={onLeave}>Leave</button>
          </div>
        </div>

        {waiting && (
          <p className="subtle" style={{ marginBottom: 0 }}>
            Waiting for your friend to join. Send them <code>{shareUrl}</code> or the code{' '}
            <strong>{code}</strong>.
          </p>
        )}
      </section>

      {room.error && (
        <div className="error" onClick={room.dismissError} role="alert">
          {room.error}
        </div>
      )}

      {hand && (
        <PokerTable
          hand={hand}
          nameOfSeat={(seat) => names[seat]}
          visibleSeats={visibleSeats(hand, room.mySeat)}
          // Your own seat sits at the bottom of the table, as at a real one.
          heroSeat={room.mySeat ?? 0}
        />
      )}

      <section className="panel">
        {!hand && !waiting && <p className="subtle">Nobody has dealt yet.</p>}

        {hand && !hand.complete && room.myTurn && (
          <ActionBar
            hand={hand}
            onAct={(action) => void room.act(action)}
            actorName={names[hand.toAct as PlayerIndex]}
            disabled={room.busy}
          />
        )}

        {hand && !hand.complete && !room.myTurn && (
          <p className="subtle">
            Waiting for {names[hand.toAct as PlayerIndex]} to act — {hand.street}.
          </p>
        )}

        {hand?.complete && <HandResult hand={hand} nameOfSeat={(seat) => names[seat]} />}

        {canDeal && (
          <div className="row" style={{ marginTop: hand ? '0.75rem' : 0 }}>
            <button className="primary" onClick={() => void room.startHand()} disabled={room.busy}>
              {room.busy ? 'Dealing…' : hand ? 'Next hand' : 'Deal first hand'}
            </button>
          </div>
        )}
      </section>

      {hand && (
        <section className="panel">
          <h2>
            Hand #{hand.handNumber} · {POSITION_LABELS[hand.players[0].position]} vs{' '}
            {POSITION_LABELS[hand.players[1].position]}
          </h2>
          <ActionLog hand={hand} nameOfSeat={(seat) => names[seat]} />
        </section>
      )}

      <HistoryPanel finished={finished} />
    </div>
  );
}

/** Our own seat is always visible; the opponent only once the server publishes it. */
function visibleSeats(hand: PublicHandState, mySeat: PlayerIndex | null): PlayerIndex[] {
  const seats = new Set<PlayerIndex>();
  if (mySeat !== null) seats.add(mySeat);
  for (const player of hand.players) {
    if (player.holeCards !== null) seats.add(player.index);
  }
  return [...seats];
}
