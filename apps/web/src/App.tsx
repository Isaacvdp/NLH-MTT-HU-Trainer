import { useCallback, useEffect, useState } from 'react';
import { POSITION_LABELS, configForSettings, spotLabel, type PlayerIndex } from 'engine';
import { useHotSeat } from './hotseat.js';
import { ActionBar } from './components/ActionBar.js';
import { ActionLog } from './components/ActionLog.js';
import { DisplaySettings } from './components/DisplaySettings.js';
import { HandResult } from './components/HandResult.js';
import { HistoryPanel, seatVisibility } from './components/HistoryPanel.js';
import { Lobby } from './components/Lobby.js';
import { OnlineRoomView } from './components/OnlineRoomView.js';
import { PokerTable } from './components/PokerTable.js';
import { SetupScreen } from './components/SetupScreen.js';
import { isSupabaseConfigured } from './supabase/client.js';

type Screen =
  | { name: 'home' }
  | { name: 'hotseat' }
  | { name: 'lobby'; code?: string }
  | { name: 'room'; roomId: string; code: string };

/** Reads `/room/CODE` out of the address bar so share links open the lobby. */
function codeFromUrl(): string | undefined {
  const match = /^\/room\/([A-Za-z0-9]+)\/?$/.exec(window.location.pathname);
  return match?.[1]?.toUpperCase();
}

export function App() {
  const hotSeat = useHotSeat();
  const { settings } = hotSeat.state;

  const [screen, setScreen] = useState<Screen>(() => {
    const code = codeFromUrl();
    return code ? { name: 'lobby', code } : { name: 'home' };
  });

  const go = useCallback((next: Screen, path = '/') => {
    window.history.pushState({}, '', path);
    setScreen(next);
  }, []);

  // Keep the back button working.
  useEffect(() => {
    const onPop = (): void => {
      const code = codeFromUrl();
      setScreen(code ? { name: 'lobby', code } : { name: 'home' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <button onClick={() => go({ name: 'home' })} style={{ all: 'unset', cursor: 'pointer' }}>
            Hold&apos;em MTT Spot Trainer
          </button>
        </h1>
        <DisplaySettings />
      </header>

      {screen.name === 'home' && (
        <Home onHotSeat={() => go({ name: 'hotseat' })} onOnline={() => go({ name: 'lobby' })} />
      )}

      {screen.name === 'lobby' && (
        <Lobby
          settings={settings}
          onChange={hotSeat.setSettings}
          initialCode={screen.code}
          onOpenRoom={(roomId, code) => go({ name: 'room', roomId, code }, `/room/${code}`)}
          onBack={() => go({ name: 'home' })}
        />
      )}

      {screen.name === 'room' && (
        <OnlineRoomView roomId={screen.roomId} code={screen.code} onLeave={() => go({ name: 'home' })} />
      )}

      {screen.name === 'hotseat' && <HotSeat hotSeat={hotSeat} onBack={() => go({ name: 'home' })} />}
    </div>
  );
}

function Home({ onHotSeat, onOnline }: { onHotSeat: () => void; onOnline: () => void }) {
  return (
    <div className="stack">
      <section className="panel">
        <h2>Play online</h2>
        <p className="subtle">
          Create a room, send the link, and play from two devices. The server deals and holds the
          cards, so neither of you can see the other&apos;s hand.
        </p>
        <div className="row">
          <button className="primary" onClick={onOnline}>
            Create or join a room
          </button>
        </div>
        {!isSupabaseConfigured && (
          <p className="subtle">
            Needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
            <code>apps/web/.env.local</code>.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Play on this device</h2>
        <p className="subtle">
          Hot seat: both players share one screen, and the waiting player&apos;s cards stay hidden.
          No account or connection needed.
        </p>
        <div className="row">
          <button onClick={onHotSeat}>Start a hot-seat session</button>
        </div>
      </section>
    </div>
  );
}

interface HotSeatProps {
  hotSeat: ReturnType<typeof useHotSeat>;
  onBack: () => void;
}

function HotSeat({ hotSeat, onBack }: HotSeatProps) {
  const { state, setSettings, startSession, nextHand, act, endSession, nameOfSeat } = hotSeat;
  const { settings, hand } = state;

  if (!hand) {
    return (
      <div className="stack">
        <SetupScreen
          settings={settings}
          onChange={setSettings}
          onStart={startSession}
          error={state.error}
        />
        <div className="row">
          <button onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="subtle">
        {spotLabel(configForSettings(settings, [0, 0]))} · hand #{hand.handNumber}
      </div>

      {state.error && <div className="error">{state.error}</div>}

      <PokerTable
        hand={hand}
        nameOfSeat={nameOfSeat}
        visibleSeats={seatVisibility(hand, {
          hideWaiting: settings.hideWaitingPlayer,
          reveal: settings.revealHandsAfterHand,
        })}
        // On one screen there is no single hero, so keep the layout still and
        // put the player who acts first postflop at the bottom.
        heroSeat={0}
      />

      <section className="panel">
        {hand.complete ? (
          <>
            <HandResult hand={hand} nameOfSeat={nameOfSeat} />
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <button className="primary" onClick={nextHand}>
                Next hand
              </button>
            </div>
          </>
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
  );
}
