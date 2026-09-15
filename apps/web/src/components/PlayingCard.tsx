import { SUIT_SYMBOLS, rankOf, suitOf, type Card } from 'engine';

interface Props {
  card?: Card | null;
  /** Show a card back instead of the face. */
  hidden?: boolean;
  small?: boolean;
}

export function PlayingCard({ card, hidden = false, small = false }: Props) {
  const size = small ? 'card small' : 'card';

  if (hidden) return <div className={`${size} hidden`} aria-label="hidden card" />;
  if (!card) return <div className={`${size} empty`} aria-hidden="true" />;

  const suit = suitOf(card);
  const red = suit === 'h' || suit === 'd';
  return (
    <div className={`${size}${red ? ' red' : ''}`} aria-label={card}>
      <span className="rank">{rankOf(card)}</span>
      <span className="suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}

interface HandProps {
  cards: readonly Card[] | null;
  hidden?: boolean;
  small?: boolean;
}

export function CardRow({ cards, hidden = false, small = false }: HandProps) {
  if (!cards) {
    return (
      <div className="cards">
        <PlayingCard hidden small={small} />
        <PlayingCard hidden small={small} />
      </div>
    );
  }
  return (
    <div className="cards">
      {cards.map((card, i) => (
        <PlayingCard key={`${card}-${i}`} card={card} hidden={hidden} small={small} />
      ))}
    </div>
  );
}
