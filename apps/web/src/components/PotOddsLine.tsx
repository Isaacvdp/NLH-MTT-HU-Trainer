import { formatEquity, formatRatio, type PotOdds } from 'engine';

interface Props {
  odds: PotOdds;
  /** `facing` is the price you are being offered; `laying` is the one you would offer. */
  kind: 'facing' | 'laying';
}

/** Just the two numbers: the equity needed, and what the pot is laying. */
export function PotOddsLine({ odds, kind }: Props) {
  return (
    <span className={`pot-odds ${kind}`}>
      <strong>{formatEquity(odds)}</strong>
      <span className="odds-ratio">{formatRatio(odds)}</span>
    </span>
  );
}
