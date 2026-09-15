import { useMemo, useState } from 'react';
import { handHistory, type HandView, type PlayerIndex } from 'engine';
import type { FinishedHand } from '../hotseat.js';

interface Props {
  /** Finished hands, newest first. Each carries the seating it was played with. */
  finished: FinishedHand[];
}

export function HistoryPanel({ finished }: Props) {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const entry = finished[Math.min(selected, finished.length - 1)];
    return entry ? handHistory(entry.hand, { playerNames: entry.names }) : '';
  }, [finished, selected]);

  if (finished.length === 0) {
    return (
      <section className="panel">
        <h2>Hand history</h2>
        <p className="subtle">Finished hands show up here, ready to copy into a solver.</p>
      </section>
    );
  }

  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const download = (): void => {
    // Oldest first, each with the names it was actually played under.
    const all = [...finished]
      .reverse()
      .map((entry) => handHistory(entry.hand, { playerNames: entry.names }))
      .join('\n\n');
    const url = URL.createObjectURL(new Blob([all], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mtt-spot-trainer-hands.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <h2>Hand history</h2>
      <div className="row" style={{ marginBottom: '0.9rem' }}>
        <select
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          style={{ maxWidth: '12rem' }}
        >
          {finished.map((entry, i) => (
            <option key={entry.hand.handNumber} value={i}>
              Hand #{entry.hand.handNumber}
            </option>
          ))}
        </select>
        <button onClick={() => void copy(text)}>{copied ? 'Copied' : 'Copy hand'}</button>
        <button onClick={download}>Download all ({finished.length})</button>
      </div>
      <pre className="history">{text}</pre>
    </section>
  );
}

export function seatVisibility(
  hand: HandView,
  options: { hideWaiting: boolean; reveal: boolean },
): PlayerIndex[] {
  if (hand.complete) {
    // At showdown both hands are already public; otherwise it is a setting.
    return hand.result?.wentToShowdown || options.reveal ? [0, 1] : [];
  }
  if (!options.hideWaiting) return [0, 1];
  return hand.toAct === null ? [] : [hand.toAct];
}
