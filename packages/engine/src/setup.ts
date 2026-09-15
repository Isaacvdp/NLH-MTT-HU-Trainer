/**
 * Hand setup: validating a spot, posting antes and blinds, seeding dead money
 * from the seats that folded before the hand started, and dealing hole cards.
 */

import { normalizeNewHand } from './actions.js';
import { type Card, cryptoRandomInt, shuffledDeck, type RandomInt } from './cards.js';
import { isAnyTwoCards, sampleFromRange, type Range } from './range.js';
import {
  assertTableSize,
  firstToAct,
  isPositionAtTable,
  preflopOrder,
} from './positions.js';
import type {
  HandEvent,
  HandState,
  PlayerIndex,
  PlayerState,
  SpotConfig,
} from './types.js';

export interface CreateHandOptions {
  /** A full, pre-shuffled deck. Supply one in tests for deterministic hands. */
  deck?: Card[];
  randomInt?: RandomInt;
  handNumber?: number;
  startedAt?: string;
  /**
   * Starting hands each seat is dealt from. An empty or absent range means any
   * two cards, which is what happens off the top of the deck anyway.
   */
  ranges?: [Range, Range];
}

export function validateSpotConfig(config: SpotConfig): void {
  assertTableSize(config.tableSize);

  const [a, b] = config.positions;
  if (a === b) throw new Error('The two live positions must be different');
  for (const position of config.positions) {
    if (!isPositionAtTable(position, config.tableSize)) {
      throw new Error(`Position ${position} does not exist at a ${config.tableSize}-handed table`);
    }
  }

  for (const [name, value] of [
    ['smallBlind', config.smallBlind],
    ['bigBlind', config.bigBlind],
    ['ante', config.ante],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer, got ${value}`);
    }
  }
  if (config.bigBlind <= 0) throw new Error('bigBlind must be greater than 0');
  if (config.smallBlind > config.bigBlind) {
    throw new Error('smallBlind may not be larger than bigBlind');
  }
  if (config.anteType !== 'none' && config.ante <= 0) {
    throw new Error('ante must be greater than 0 when an ante type is set');
  }

  for (const stack of config.stacks) {
    if (!Number.isInteger(stack) || stack <= 0) {
      throw new Error(`Stacks must be positive integers, got ${stack}`);
    }
  }
}

function makePlayer(index: PlayerIndex, config: SpotConfig): PlayerState {
  return {
    index,
    position: config.positions[index],
    startingStack: config.stacks[index],
    stack: config.stacks[index],
    committedThisStreet: 0,
    committedTotal: 0,
    holeCards: null,
    status: 'active',
    hasActedThisStreet: false,
  };
}

/** Moves chips from a player's stack into the pot. Returns what was actually taken. */
function take(player: PlayerState, amount: number): number {
  const paid = Math.min(amount, player.stack);
  player.stack -= paid;
  player.committedTotal += paid;
  if (player.stack === 0) player.status = 'all-in';
  return paid;
}

/**
 * Builds a fresh hand: posts antes and blinds, adds the dead money left behind
 * by the seats that are not in play, and deals two cards to each live player.
 *
 * Card layout of the deck: `[p0a, p0b, p1a, p1b, flop×3, turn, river, ...]`.
 */
export function createHand(config: SpotConfig, options: CreateHandOptions = {}): HandState {
  validateSpotConfig(config);

  const deck = options.deck ? options.deck.slice() : shuffledDeck(options.randomInt);
  if (deck.length < 9) throw new Error('Deck must contain at least 9 cards');
  if (new Set(deck).size !== deck.length) throw new Error('Deck contains duplicate cards');

  const players: [PlayerState, PlayerState] = [makePlayer(0, config), makePlayer(1, config)];
  const events: HandEvent[] = [];
  let deadMoney = 0;

  const live = new Map<string, PlayerState>();
  for (const player of players) live.set(player.position, player);

  const seats = preflopOrder(config.tableSize);

  // 1. Antes, posted before the blinds.
  if (config.anteType === 'per-player') {
    let deadAntes = 0;
    let deadSeats = 0;
    for (const seat of seats) {
      const player = live.get(seat);
      if (player) {
        const paid = take(player, config.ante);
        if (paid > 0) {
          events.push({ kind: 'post', player: player.index, post: 'ante', amount: paid, allIn: player.stack === 0 });
        }
      } else {
        deadAntes += config.ante;
        deadSeats += 1;
      }
    }
    if (deadAntes > 0) {
      deadMoney += deadAntes;
      events.push({ kind: 'dead', source: 'ante', amount: deadAntes, seats: deadSeats });
    }
  } else if (config.anteType === 'bb') {
    const player = live.get('BB');
    if (player) {
      const paid = take(player, config.ante);
      if (paid > 0) {
        events.push({ kind: 'post', player: player.index, post: 'ante', amount: paid, allIn: player.stack === 0 });
      }
    } else {
      deadMoney += config.ante;
      events.push({ kind: 'dead', source: 'ante', amount: config.ante, seats: 1 });
    }
  }

  // 2. Blinds. A blind posted by a live player is a live bet on the preflop
  //    street; a blind from a folded seat is dead money.
  for (const [seat, blind] of [
    ['SB', config.smallBlind],
    ['BB', config.bigBlind],
  ] as const) {
    if (blind === 0) continue;
    const player = live.get(seat);
    if (player) {
      const paid = take(player, blind);
      player.committedThisStreet += paid;
      events.push({
        kind: 'post',
        player: player.index,
        post: seat === 'SB' ? 'sb' : 'bb',
        amount: paid,
        allIn: player.stack === 0,
      });
    } else {
      deadMoney += blind;
      events.push({ kind: 'dead', source: seat === 'SB' ? 'sb' : 'bb', amount: blind, seats: 1 });
    }
  }

  // 3. Hole cards. Ranges, when set, decide which four cards come off the top;
  //    the rest of the deck is untouched and still deals the board.
  const dealt = dealHoleCards(deck, options.ranges, options.randomInt ?? cryptoRandomInt);
  players[0].holeCards = dealt[0];
  players[1].holeCards = dealt[1];
  events.push({ kind: 'deal-hole', player: 0 }, { kind: 'deal-hole', player: 1 });

  const pot = deadMoney + players[0].committedTotal + players[1].committedTotal;

  const state: HandState = {
    config,
    players,
    deadMoney,
    pot,
    board: [],
    street: 'preflop',
    // The hole cards have already been taken out of the deck.
    deck: deck.slice(),
    // The bet to match preflop is the big blind, whether or not that seat is live.
    toAct: firstToAct(config.positions, config.tableSize, 'preflop'),
    currentBet: config.bigBlind,
    lastRaiseSize: config.bigBlind,
    incompleteRaise: false,
    complete: false,
    result: null,
    events,
    handNumber: options.handNumber ?? 1,
    startedAt: options.startedAt ?? new Date().toISOString(),
  };

  // If a player was put all-in by the blinds there may be nothing to decide, so
  // let the hand settle itself before handing it back.
  return normalizeNewHand(state);
}

/** Total dead money a spot contributes, without building a hand. */
export function deadMoneyFor(config: SpotConfig): number {
  validateSpotConfig(config);
  const live = new Set<string>(config.positions);
  let dead = 0;

  if (config.anteType === 'per-player') {
    for (const seat of preflopOrder(config.tableSize)) {
      if (!live.has(seat)) dead += config.ante;
    }
  } else if (config.anteType === 'bb' && !live.has('BB')) {
    dead += config.ante;
  }
  if (!live.has('SB')) dead += config.smallBlind;
  if (!live.has('BB')) dead += config.bigBlind;

  return dead;
}

/** How many times to re-draw the first hand when it blocks out the second range. */
const RANGE_RETRIES = 40;

/**
 * Takes four cards off the deck for the two players, honouring their ranges.
 *
 * The chosen cards are moved to the front of the deck so everything downstream
 * — the board, the remaining stub — carries on as if they had been dealt off
 * the top, which they effectively were.
 */
function dealHoleCards(
  deck: Card[],
  ranges: [Range, Range] | undefined,
  randomInt: RandomInt,
): [[Card, Card], [Card, Card]] {
  const unrestricted: [[Card, Card], [Card, Card]] = [
    [deck[0]!, deck[1]!],
    [deck[2]!, deck[3]!],
  ];
  if (!ranges || (isAnyTwoCards(ranges[0]) && isAnyTwoCards(ranges[1]))) {
    deck.splice(0, 4);
    return unrestricted;
  }

  for (let attempt = 0; attempt < RANGE_RETRIES; attempt++) {
    const available = new Set(deck);

    const first = isAnyTwoCards(ranges[0])
      ? ([deck[0]!, deck[1]!] as [Card, Card])
      : sampleFromRange(ranges[0], available, randomInt);
    if (!first) throw new Error('The first range has no hands that can be dealt');

    available.delete(first[0]);
    available.delete(first[1]);

    const second = isAnyTwoCards(ranges[1])
      ? firstAvailable(deck, available)
      : sampleFromRange(ranges[1], available, randomInt);

    // A narrow second range can be blocked by the first hand; redraw and retry.
    if (!second) continue;

    for (const card of [...second, ...first].reverse()) {
      const index = deck.indexOf(card);
      if (index !== -1) deck.splice(index, 1);
    }
    return [first, second];
  }

  throw new Error('Could not deal both hands from their ranges; the ranges may be too narrow');
}

/** The next two untouched cards, for a seat with no range of its own. */
function firstAvailable(deck: Card[], available: ReadonlySet<Card>): [Card, Card] | null {
  const cards = deck.filter((card) => available.has(card)).slice(0, 2);
  return cards.length === 2 ? [cards[0]!, cards[1]!] : null;
}
