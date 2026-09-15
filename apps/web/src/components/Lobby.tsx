import { useState } from 'react';
import { SetupScreen } from './SetupScreen.js';
import { createRoom, joinRoom } from '../supabase/room.js';
import { isSupabaseConfigured } from '../supabase/client.js';
import type { Settings } from '../hotseat.js';

interface Props {
  settings: Settings;
  onChange: (update: Partial<Settings>) => void;
  onOpenRoom: (roomId: string, code: string) => void;
  onBack: () => void;
  /** Code taken from the share link, if the page was opened with one. */
  initialCode?: string;
}

export function Lobby({ settings, onChange, onOpenRoom, onBack, initialCode }: Props) {
  const [mode, setMode] = useState<'choose' | 'create'>(initialCode ? 'choose' : 'choose');
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="stack">
        <div className="error">
          Supabase is not configured for this build. Copy <code>apps/web/.env.example</code> to{' '}
          <code>.env.local</code>, fill in the project URL and anon key, and restart the dev server.
        </div>
        <div className="row">
          <button onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  const run = async (work: () => Promise<{ roomId: string; code: string }>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const room = await work();
      onOpenRoom(room.roomId, room.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'create') {
    return (
      <div className="stack">
        {error && <div className="error">{error}</div>}
        <SetupScreen
          settings={settings}
          onChange={onChange}
          onStart={() => void run(() => createRoom(settings))}
          error={null}
          startLabel={busy ? 'Creating room…' : 'Create room'}
          busy={busy}
          showLocalOptions={false}
        />
        <div className="row">
          <button onClick={() => setMode('choose')} disabled={busy}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}

      <section className="panel">
        <h2>Start a table</h2>
        <p className="subtle">
          Set the spot up, create the room, then send your friend the link. Stacks, blinds and
          seating are the room&apos;s — your friend just joins.
        </p>
        <div className="row">
          <button className="primary" onClick={() => setMode('create')} disabled={busy}>
            Set up a new room
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Join a table</h2>
        <p className="subtle">Paste the code your friend sent you.</p>
        <div className="row">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.trim()) void run(() => joinRoom(code));
            }}
            placeholder="ABC123"
            aria-label="Room code"
            style={{ maxWidth: '10rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            maxLength={12}
          />
          <button onClick={() => void run(() => joinRoom(code))} disabled={busy || !code.trim()}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      </section>

      <div className="row">
        <button onClick={onBack} disabled={busy}>
          Back
        </button>
      </div>
    </div>
  );
}
