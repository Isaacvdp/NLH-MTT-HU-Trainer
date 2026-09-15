/**
 * PokerStars-style hand history.
 *
 * The seats that folded before the hand started are written out as real seats
 * that post their blinds/antes and fold, so the dead money is attributable and
 * the text imports cleanly into solvers and trackers.
 */

import type { Card } from './cards.js';
import { POSITION_LABELS, type Position, buttonPosition, postflopOrder, preflopOrder } from './positions.js';
import type { HandEvent, HandView, PlayerIndex, Street } from './types.js';

export interface HistoryOptions {
  handId?: number | string;
  tournamentId?: string;
  level?: string;
  /** Names for the two live players; defaults to their position labels. */
  playerNames?: [string, string];
  /** Only show this player's hole cards in the "Dealt to" lines. */
  heroIndex?: PlayerIndex;
  /** Write the folded seats out as real seats. Defaults to `true`. */
  includeDeadSeats?: boolean;
}

const STREET_HEADINGS: Record<Exclude<Street, 'preflop'>, string> = {
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
};

function cardList(cards: readonly Card[]): string {
  return `[${cards.join(' ')}]`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} ET`
  );
}

interface Seat {
  position: Position;
  seatNumber: number;
  name: string;
  stack: number;
  /** Index of the live player in this seat, or `null` for a folded seat. */
  player: PlayerIndex | null;
}

function buildSeats(state: HandView, options: HistoryOptions): Seat[] {
  const { config } = state;
  const names = options.playerNames;
  const order = postflopOrder(config.tableSize);
  const nominalStack = Math.max(...config.stacks);

  return order.map((position, i) => {
    const index = config.positions.indexOf(position) as -1 | 0 | 1;
    if (index === -1) {
      return { position, seatNumber: i + 1, name: POSITION_LABELS[position], stack: nominalStack, player: null };
    }
    const player: PlayerIndex = index;
    return {
      position,
      seatNumber: i + 1,
      name: names?.[player] ?? POSITION_LABELS[position],
      stack: state.players[player].startingStack,
      player,
    };
  });
}

interface ActionEvent {
  player: PlayerIndex;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
  to?: number;
  amount: number;
  allIn: boolean;
}

/** Splits the action events into one bucket per street. */
function actionsByStreet(events: HandEvent[]): Record<Street, ActionEvent[]> {
  const buckets: Record<Street, ActionEvent[]> = { preflop: [], flop: [], turn: [], river: [] };
  let street: Street = 'preflop';
  for (const event of events) {
    if (event.kind === 'deal-board') street = event.street;
    else if (event.kind === 'action') {
      buckets[street].push({
        player: event.player,
        action: event.action,
        to: event.to,
        amount: event.amount,
        allIn: event.allIn,
      });
    }
  }
  return buckets;
}

function actionLine(name: string, event: ActionEvent, betBefore: number, bigBlind: number): string {
  const allIn = event.allIn ? ' and is all-in' : '';
  switch (event.action) {
    case 'fold':
      return `${name}: folds`;
    case 'check':
      return `${name}: checks`;
    case 'call':
      return `${name}: calls ${event.amount}${allIn}`;
    case 'bet':
      return `${name}: bets ${event.amount}${allIn}`;
    case 'raise':
      return `${name}: raises ${(event.to ?? 0) - betBefore} to ${event.to}${allIn}`;
    default:
      return `${name}: bets ${event.amount}${allIn}`;
  }
}

function emitStreetActions(
  lines: string[],
  events: ActionEvent[],
  seatFor: (player: PlayerIndex) => Seat,
  openingBet: number,
  bigBlind: number,
): void {
  let bet = openingBet;
  for (const event of events) {
    lines.push(actionLine(seatFor(event.player).name, event, bet, bigBlind));
    if ((event.action === 'raise' || event.action === 'bet') && event.to !== undefined) {
      bet = event.to;
    }
  }
}

export function handHistory(state: HandView, options: HistoryOptions = {}): string {
  const { config } = state;
  const includeDead = options.includeDeadSeats ?? true;
  const seats = buildSeats(state, options);
  const seatFor = (player: PlayerIndex): Seat => seats.find((seat) => seat.player === player)!;
  const seatAt = (position: Position): Seat => seats.find((seat) => seat.position === position)!;
  const buttonSeat = seatAt(buttonPosition(config.tableSize));

  const lines: string[] = [];
  const handId = options.handId ?? state.handNumber;
  const tournamentId = options.tournamentId ?? 'MTT-SPOT';
  const level = options.level ?? `${config.smallBlind}/${config.bigBlind}`;

  lines.push(
    `PokerStars Hand #${handId}: Tournament #${tournamentId}, Hold'em No Limit - ` +
      `Level (${config.smallBlind}/${config.bigBlind}) - ${formatTimestamp(state.startedAt)}`,
  );
  lines.push(
    `Table '${tournamentId}' ${config.tableSize}-max Seat #${buttonSeat.seatNumber} is the button`,
  );

  const shownSeats = includeDead ? seats : seats.filter((seat) => seat.player !== null);
  for (const seat of shownSeats) {
    lines.push(`Seat ${seat.seatNumber}: ${seat.name} (${seat.stack} in chips)`);
  }

  // Posts. Antes come before the blinds.
  const posts = state.events.filter((event): event is Extract<HandEvent, { kind: 'post' }> => event.kind === 'post');
  const postAmount = (player: PlayerIndex, post: 'sb' | 'bb' | 'ante'): number =>
    posts.find((event) => event.player === player && event.post === post)?.amount ?? 0;
  const postAllIn = (player: PlayerIndex, post: 'sb' | 'bb' | 'ante'): string =>
    posts.find((event) => event.player === player && event.post === post)?.allIn ? ' and is all-in' : '';

  if (config.anteType === 'per-player') {
    for (const seat of shownSeats) {
      const amount = seat.player === null ? config.ante : postAmount(seat.player, 'ante');
      if (amount > 0) {
        lines.push(`${seat.name}: posts the ante ${amount}${seat.player === null ? '' : postAllIn(seat.player, 'ante')}`);
      }
    }
  } else if (config.anteType === 'bb') {
    const seat = seatAt('BB');
    if (includeDead || seat.player !== null) {
      const amount = seat.player === null ? config.ante : postAmount(seat.player, 'ante');
      if (amount > 0) lines.push(`${seat.name}: posts the ante ${amount}`);
    }
  }

  for (const [position, blind, label] of [
    ['SB', config.smallBlind, 'small blind'],
    ['BB', config.bigBlind, 'big blind'],
  ] as const) {
    const seat = seatAt(position);
    if (!includeDead && seat.player === null) continue;
    const amount = seat.player === null ? blind : postAmount(seat.player, position === 'SB' ? 'sb' : 'bb');
    if (amount > 0) {
      const allIn = seat.player === null ? '' : postAllIn(seat.player, position === 'SB' ? 'sb' : 'bb');
      lines.push(`${seat.name}: posts ${label} ${amount}${allIn}`);
    }
  }

  lines.push('*** HOLE CARDS ***');
  for (const player of [0, 1] as const) {
    if (options.heroIndex !== undefined && options.heroIndex !== player) continue;
    const cards = state.players[player].holeCards;
    if (cards) lines.push(`Dealt to ${seatFor(player).name} ${cardList(cards)}`);
  }

  const byStreet = actionsByStreet(state.events);

  // Preflop: fold out the dead seats in position order, interleaved with the
  // live players' first actions.
  const queue = byStreet.preflop.slice();
  let preflopBet = config.bigBlind;
  const emitOne = (): void => {
    const event = queue.shift();
    if (!event) return;
    lines.push(actionLine(seatFor(event.player).name, event, preflopBet, config.bigBlind));
    if ((event.action === 'raise' || event.action === 'bet') && event.to !== undefined) {
      preflopBet = event.to;
    }
  };

  const seen = new Set<PlayerIndex>();
  for (const position of preflopOrder(config.tableSize)) {
    const seat = seatAt(position);
    if (seat.player === null) {
      if (includeDead) lines.push(`${seat.name}: folds`);
      continue;
    }
    if (!seen.has(seat.player)) {
      seen.add(seat.player);
      if (queue[0]?.player === seat.player) emitOne();
    }
  }
  while (queue.length > 0) emitOne();

  // Board streets.
  for (const event of state.events) {
    if (event.kind !== 'deal-board') continue;
    const boardSoFar = state.board.slice(0, event.street === 'flop' ? 3 : event.street === 'turn' ? 4 : 5);
    const heading =
      event.street === 'flop'
        ? `*** FLOP *** ${cardList(boardSoFar)}`
        : `*** ${STREET_HEADINGS[event.street]} *** ${cardList(boardSoFar.slice(0, -1))} ${cardList(event.cards)}`;
    lines.push(heading);
    emitStreetActions(lines, byStreet[event.street], seatFor, 0, config.bigBlind);
  }

  const returned = state.events.find((event): event is Extract<HandEvent, { kind: 'return' }> => event.kind === 'return');
  if (returned) {
    lines.push(`Uncalled bet (${returned.amount}) returned to ${seatFor(returned.player).name}`);
  }

  const shows = state.events.filter((event): event is Extract<HandEvent, { kind: 'show' }> => event.kind === 'show');
  if (shows.length > 0) {
    lines.push('*** SHOW DOWN ***');
    for (const show of shows) {
      lines.push(`${seatFor(show.player).name}: shows ${cardList(show.cards)} (${show.description})`);
    }
  }

  const awards = state.events.filter((event): event is Extract<HandEvent, { kind: 'award' }> => event.kind === 'award');
  for (const award of awards) {
    if (award.amount <= 0) continue;
    lines.push(`${seatFor(award.player).name} collected ${award.amount} from pot`);
  }

  if (state.complete) {
    const total = awards.reduce((sum, award) => sum + award.amount, 0);
    lines.push('*** SUMMARY ***');
    lines.push(`Total pot ${total} | Rake 0`);
    if (state.board.length > 0) lines.push(`Board ${cardList(state.board)}`);
    for (const seat of shownSeats) {
      const suffix = seat.position === buttonSeat.position ? ' (button)' : '';
      if (seat.player === null) {
        lines.push(`Seat ${seat.seatNumber}: ${seat.name}${suffix} folded before Flop`);
        continue;
      }
      const won = awards.filter((award) => award.player === seat.player).reduce((sum, a) => sum + a.amount, 0);
      const player = state.players[seat.player];
      if (won > 0) {
        const shown = shows.find((show) => show.player === seat.player);
        lines.push(
          shown
            ? `Seat ${seat.seatNumber}: ${seat.name}${suffix} showed ${cardList(shown.cards)} and won (${won}) with ${shown.description}`
            : `Seat ${seat.seatNumber}: ${seat.name}${suffix} collected (${won})`,
        );
      } else if (player.status === 'folded') {
        lines.push(`Seat ${seat.seatNumber}: ${seat.name}${suffix} folded`);
      } else {
        const shown = shows.find((show) => show.player === seat.player);
        lines.push(
          shown
            ? `Seat ${seat.seatNumber}: ${seat.name}${suffix} showed ${cardList(shown.cards)} and lost with ${shown.description}`
            : `Seat ${seat.seatNumber}: ${seat.name}${suffix} mucked`,
        );
      }
    }
  }

  return lines.join('\n');
}

/** Concatenates several hand histories, newest last, for export. */
export function handHistories(states: HandView[], options: HistoryOptions = {}): string {
  return states.map((state, i) => handHistory(state, { ...options, handId: options.handId ?? state.handNumber ?? i + 1 })).join('\n\n');
}
