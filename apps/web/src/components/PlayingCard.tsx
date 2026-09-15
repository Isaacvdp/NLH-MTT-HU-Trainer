import { SUIT_SYMBOLS, rankOf, suitOf, type Card } from 'engine';

type Size = 'board' | 'seat' | 'hero';

interface Props {
  card?: Card | null;
  /** Show a card back instead of the face. */
  hidden?: boolean;
  size?: Size;
  /** Staggers the deal-in animation, in deal order. */
  dealIndex?: number;
}

/**
 * Suit colour comes from a `data-suit` attribute rather than a class, so the
 * two- and four-colour palettes are one CSS swap on the root element.
 */
export function PlayingCard({ card, hidden = false, size = 'seat', dealIndex = 0 }: Props) {
  const className = `card card-${size}`;
  const delay = { ['--deal-delay' as string]: `${dealIndex * 70}ms` };

  if (!card) return <div className={`${className} empty`} aria-hidden="true" />;
  if (hidden) {
    return <div className={`${className} hidden`} style={delay} aria-label="face-down card" />;
  }

  const suit = suitOf(card);
  return (
    <div className={className} style={delay} data-suit={suit} aria-label={card}>
      <span className="rank">{rankOf(card)}</span>
      <span className="suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}

interface HandProps {
  cards: readonly Card[] | null;
  hidden?: boolean;
  size?: Size;
}

/** A player's two cards, or two backs when there is nothing to show. */
export function CardRow({ cards, hidden = false, size = 'seat' }: HandProps) {
  if (!cards) {
    return (
      <div className="cards">
        <PlayingCard hidden size={size} dealIndex={0} />
        <PlayingCard hidden size={size} dealIndex={1} />
      </div>
    );
  }
  return (
    <div className="cards">
      {cards.map((card, i) => (
        <PlayingCard key={`${card}-${i}`} card={card} hidden={hidden} size={size} dealIndex={i} />
      ))}
    </div>
  );
}
