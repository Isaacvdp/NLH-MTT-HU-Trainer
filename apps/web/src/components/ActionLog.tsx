import type { HandEvent, HandView, PlayerIndex } from 'engine';
import { chips } from '../format.js';

interface Props {
  hand: HandView;
  nameOfSeat: (seat: PlayerIndex) => string;
}

function lineFor(event: HandEvent, name: (seat: PlayerIndex) => string): { text: string; street?: boolean } | null {
  switch (event.kind) {
    case 'dead':
      return {
        text:
          event.source === 'ante'
            ? `Dead antes from ${event.seats} folded ${event.seats === 1 ? 'seat' : 'seats'}: ${chips(event.amount)}`
            : `Dead ${event.source === 'sb' ? 'small blind' : 'big blind'}: ${chips(event.amount)}`,
      };
    case 'post': {
      const what = event.post === 'ante' ? 'ante' : event.post === 'sb' ? 'small blind' : 'big blind';
      return { text: `${name(event.player)} posts the ${what} ${chips(event.amount)}${event.allIn ? ' (all-in)' : ''}` };
    }
    case 'action': {
      const who = name(event.player);
      const allIn = event.allIn ? ' (all-in)' : '';
      switch (event.action) {
        case 'fold':
          return { text: `${who} folds` };
        case 'check':
          return { text: `${who} checks` };
        case 'call':
          return { text: `${who} calls ${chips(event.amount)}${allIn}` };
        case 'bet':
          return { text: `${who} bets ${chips(event.to ?? event.amount)}${allIn}` };
        default:
          return { text: `${who} raises to ${chips(event.to ?? event.amount)}${allIn}` };
      }
    }
    case 'deal-board':
      return { text: `${event.street.toUpperCase()} — ${event.cards.join(' ')}`, street: true };
    case 'show':
      return { text: `${name(event.player)} shows ${event.cards.join(' ')} — ${event.description}` };
    case 'return':
      return { text: `Uncalled ${chips(event.amount)} returned to ${name(event.player)}` };
    case 'award':
      return { text: `${name(event.player)} wins ${chips(event.amount)}` };
    default:
      return null;
  }
}

export function ActionLog({ hand, nameOfSeat }: Props) {
  const lines = hand.events.map((event) => lineFor(event, nameOfSeat)).filter((line) => line !== null);

  return (
    <ul className="log">
      {lines.map((line, i) => (
        <li key={i} className={line.street ? 'street' : undefined}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}
