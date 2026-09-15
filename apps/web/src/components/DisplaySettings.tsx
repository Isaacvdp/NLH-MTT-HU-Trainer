import { SUIT_SYMBOLS } from 'engine';
import { useDisplayPrefs } from '../display.js';

/**
 * Two viewing toggles that sit in the header. They are per-person, not part of
 * the room, so both players can read the same table their own way.
 */
export function DisplaySettings() {
  const { prefs, setPrefs } = useDisplayPrefs();

  return (
    <div className="display-settings">
      <label className="toggle-chip" data-on={prefs.bigBlinds}>
        <input
          type="checkbox"
          checked={prefs.bigBlinds}
          onChange={(event) => setPrefs({ bigBlinds: event.target.checked })}
        />
        {prefs.bigBlinds ? 'Big blinds' : 'Chips'}
      </label>

      <label className="toggle-chip" data-on={prefs.fourColorDeck} title="Four-colour deck">
        <input
          type="checkbox"
          checked={prefs.fourColorDeck}
          onChange={(event) => setPrefs({ fourColorDeck: event.target.checked })}
        />
        <span className="suit-swatches" aria-hidden="true">
          <span style={{ color: 'var(--suit-s)' }}>{SUIT_SYMBOLS.s}</span>
          <span style={{ color: 'var(--suit-h)' }}>{SUIT_SYMBOLS.h}</span>
          <span style={{ color: 'var(--suit-d)' }}>{SUIT_SYMBOLS.d}</span>
          <span style={{ color: 'var(--suit-c)' }}>{SUIT_SYMBOLS.c}</span>
        </span>
        {prefs.fourColorDeck ? '4-colour' : '2-colour'}
      </label>
    </div>
  );
}
