import { POSITION_LABELS, spotLabel, type PlayerIndex } from 'engine';
import { configFor, useHotSeat } from './hotseat.js';
import { ActionBar } from './components/ActionBar.js';
import { ActionLog } from './components/ActionLog.js';
import { HistoryPanel, seatVisibility } from './components/HistoryPanel.js';
import { SetupScreen } from './components/SetupScreen.js';
import { TableView } from './components/TableView.js';
import { chips, chipsWithBb, signed } from './format.js';

export function App() {
  const { state, setSettings, startSession, nextHand, act, endSession, nameOfSeat } = useHotSeat();
  const { settings, hand } = state;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Hold&apos;em MTT Spot Trainer</h1>
        <div className="subtle">
          {spotLabel(configFor(settings, [0, 0] as [number, number]))} ·{' '}
          {chips(settings.smallBlind)}/{chips(settings.bigBlind)}
          {settings.anteType !== 'none' && ` · ante ${chips(settings.ante)}`}
        </div>
      </header>

      {!hand ? (
        <SetupScreen settings={settings} onChange={setSettings} onStart={startSession} error={state.error} />
      ) : (
        <div className="stack">
          {state.error && <div className="error">{state.error}</div>}

          <TableView
            hand={hand}
            nameOfSeat={nameOfSeat}
            visibleSeats={seatVisibility(hand, {
              hideWaiting: settings.hideWaitingPlayer,
              reveal: settings.revealHandsAfterHand,
            })}
          />

          <section className="panel">
            {hand.complete ? (
              <Result hand={hand} nameOfSeat={nameOfSeat} onNext={nextHand} />
            ) : (
              <ActionBar hand={hand} onAct={act} actorName={nameOfSeat(hand.toAct as PlayerIndex)} />
            )}
          </section>

          <section className="panel">
            <h2>
              Hand #{hand.handNumber} · {POSITION_LABELS[hand.players[0].position]} vs{' '}
              {POSITION_LABELS[hand.players[1].position]}
            </h2>
            <ActionLog hand={hand} nameOfSeat={nameOfSeat} />
          </section>

          <HistoryPanel finished={state.finished} />

          <div className="row">
            <button onClick={endSession}>Back to setup</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ResultProps {
  hand: NonNullable<ReturnType<typeof useHotSeat>['state']['hand']>;
  nameOfSeat: (seat: PlayerIndex) => string;
  onNext: () => void;
}

function Result({ hand, nameOfSeat, onNext }: ResultProps) {
  const result = hand.result;
  if (!result) return null;

  const headline =
    result.winners.length === 2
      ? 'Split pot'
      : `${nameOfSeat(result.winners[0]!)} wins ${chips(result.awarded[result.winners[0]!])}`;

  return (
    <div className="result">
      <strong>{headline}</strong>
      {result.wentToShowdown &&
        result.hands?.map((value, seat) => (
          <div key={seat} className="subtle">
            {nameOfSeat(seat as PlayerIndex)}: {value.description}
          </div>
        ))}
      <div className="net">
        {([0, 1] as const).map((seat) => (
          <span key={seat} style={{ marginRight: '1rem' }}>
            {nameOfSeat(seat)} {signed(result.net[seat])} → {chipsWithBb(hand.players[seat].stack, hand.config.bigBlind)}
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button className="primary" onClick={onNext}>
          Next hand
        </button>
      </div>
    </div>
  );
}
