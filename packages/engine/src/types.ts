import type { Card } from './cards.js';
import type { HandValue } from './evaluator.js';
import type { Position } from './positions.js';

/**
 * Ante structure.
 *  - `none`        no antes.
 *  - `bb`          big blind ante: the big blind seat posts one ante for the
 *                  whole table. It is dead money, not part of their live bet.
 *  - `per-player`  every seat at the table antes; the two live players pay from
 *                  their own stacks, the folded seats' antes are dead money.
 */
export type AnteType = 'none' | 'bb' | 'per-player';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type PlayerIndex = 0 | 1;

export interface SpotConfig {
  /** Seats at the simulated table, 2-9. */
  tableSize: number;
  smallBlind: number;
  bigBlind: number;
  anteType: AnteType;
  /** Ante size in chips; ignored when `anteType` is `'none'`. */
  ante: number;
  /** The two live seats. Index 0/1 line up with `stacks` and `players`. */
  positions: [Position, Position];
  /** Starting stacks in chips, before any ante or blind is posted. */
  stacks: [number, number];
}

export type PlayerStatus = 'active' | 'folded' | 'all-in';

export interface PlayerState {
  index: PlayerIndex;
  position: Position;
  /** Stack before posting antes and blinds. */
  startingStack: number;
  /** Chips still behind. */
  stack: number;
  /** Chips put in on the current street (antes are not part of this). */
  committedThisStreet: number;
  /** Chips put in this hand, antes and blinds included. */
  committedTotal: number;
  holeCards: [Card, Card] | null;
  status: PlayerStatus;
  /** Whether this player has acted on the current street. Blind posts don't count. */
  hasActedThisStreet: boolean;
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `to` is the player's total commitment on this street after the bet. */
  | { type: 'bet'; to: number }
  /** `to` is the player's total commitment on this street after the raise. */
  | { type: 'raise'; to: number }
  | { type: 'all-in' };

export interface LegalActions {
  /** Which player these apply to. */
  player: PlayerIndex;
  types: ActionType[];
  /** Extra chips needed to call. `0` when there is nothing to call. */
  callAmount: number;
  /** Street total after calling. */
  callTo: number;
  /** Smallest legal `to` for a bet, when `bet` is legal. */
  minBetTo: number;
  /** Smallest legal `to` for a raise, when `raise` is legal. */
  minRaiseTo: number;
  /** Largest legal `to` for a bet or raise — the effective all-in amount. */
  maxTo: number;
  /** Extra chips an all-in would cost this player. */
  allInAmount: number;
}

export type HandEvent =
  | { kind: 'post'; player: PlayerIndex; post: 'sb' | 'bb' | 'ante'; amount: number; allIn: boolean }
  | { kind: 'dead'; source: 'sb' | 'bb' | 'ante'; amount: number; seats: number }
  | { kind: 'deal-hole'; player: PlayerIndex }
  | { kind: 'action'; player: PlayerIndex; action: ActionType; to?: number; amount: number; allIn: boolean }
  | { kind: 'deal-board'; street: Exclude<Street, 'preflop'>; cards: Card[] }
  | { kind: 'show'; player: PlayerIndex; cards: [Card, Card]; description: string }
  | { kind: 'muck'; player: PlayerIndex }
  | { kind: 'return'; player: PlayerIndex; amount: number }
  | { kind: 'award'; player: PlayerIndex; amount: number; reason: 'fold' | 'showdown' | 'split' };

export interface HandResult {
  /** Indices of the winning player(s); two entries means a split. */
  winners: PlayerIndex[];
  /** Chips pushed to each player, uncalled bets excluded. */
  awarded: [number, number];
  /** Final stack minus starting stack, for each player. */
  net: [number, number];
  wentToShowdown: boolean;
  /** Present only when the hand reached showdown. */
  hands: [HandValue, HandValue] | null;
}

export interface HandState {
  config: SpotConfig;
  players: [PlayerState, PlayerState];
  /** Chips from seats that are not live (folded blinds and their antes). */
  deadMoney: number;
  /** Every chip in the middle: dead money plus both players' total commitment. */
  pot: number;
  board: Card[];
  street: Street;
  /** Cards not yet dealt. Never sent to a client. */
  deck: Card[];
  /** Whose turn it is, or `null` when the hand is over. */
  toAct: PlayerIndex | null;
  /** Highest street commitment a player must match. */
  currentBet: number;
  /** Size of the last full bet/raise increment — the minimum next raise increment. */
  lastRaiseSize: number;
  /**
   * True when the outstanding bet was raised by an all-in that was smaller than
   * a full raise. A player who has already acted this street may then only call
   * or fold, never re-raise.
   */
  incompleteRaise: boolean;
  complete: boolean;
  result: HandResult | null;
  events: HandEvent[];
  handNumber: number;
  startedAt: string;
}

/** The subset of a hand that is safe to show every player at the table. */
export interface PublicHandState extends Omit<HandState, 'deck' | 'players'> {
  players: [Omit<PlayerState, 'holeCards'> & { holeCards: [Card, Card] | null }, Omit<PlayerState, 'holeCards'> & { holeCards: [Card, Card] | null }];
}
