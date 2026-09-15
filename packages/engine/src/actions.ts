/**
 * Betting rules: which actions are legal, what they cost, and how the hand
 * moves from street to street. Every exported function is pure — `applyAction`
 * clones the state it is given and never mutates it.
 */

import { evaluateHand } from './evaluator.js';
import { firstToAct } from './positions.js';
import type {
  Action,
  ActionType,
  HandState,
  HandView,
  LegalActions,
  PlayerIndex,
  PlayerState,
  Street,
} from './types.js';

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

function other(index: PlayerIndex): PlayerIndex {
  return index === 0 ? 1 : 0;
}

/** Highest street total this player can reach with the chips they have. */
function ownCap(player: PlayerState): number {
  return player.committedThisStreet + player.stack;
}

/**
 * Highest street total that can matter: nobody can win more than the shorter
 * stack can put in, so bets are capped at the effective stack.
 */
function effectiveCap(state: HandView, index: PlayerIndex): number {
  const player = state.players[index];
  const opponent = state.players[other(index)];
  if (opponent.status === 'folded') return ownCap(player);
  return Math.min(ownCap(player), ownCap(opponent));
}

/** Street total this player must reach to stay in the hand. */
function callTarget(state: HandView, index: PlayerIndex): number {
  return Math.min(state.currentBet, effectiveCap(state, index));
}

/** Players who still have chips behind and have not folded. */
function contesting(state: HandView): PlayerState[] {
  return state.players.filter((p) => p.status === 'active');
}

export function legalActions(state: HandView): LegalActions | null {
  if (state.toAct === null || state.complete) return null;
  return legalActionsFor(state, state.toAct);
}

export function legalActionsFor(state: HandView, index: PlayerIndex): LegalActions {
  const player = state.players[index];
  const maxTo = effectiveCap(state, index);
  const toCall = callTarget(state, index);
  const callAmount = Math.max(0, toCall - player.committedThisStreet);
  const allInAmount = Math.max(0, maxTo - player.committedThisStreet);

  const types: ActionType[] = [];
  const opponent = state.players[other(index)];
  const canAggress =
    maxTo > toCall &&
    opponent.status === 'active' &&
    !(state.incompleteRaise && player.hasActedThisStreet);

  if (callAmount > 0) {
    types.push('fold', 'call');
  } else {
    types.push('check');
  }

  const opening = state.currentBet === 0;
  // `all-in` is only its own action when it puts in more than a call would; when
  // calling already commits the last chip, `call` covers it.
  if (canAggress) types.push(opening ? 'bet' : 'raise', 'all-in');

  const minBetTo = opening ? Math.min(state.config.bigBlind, maxTo) : 0;
  const minRaiseTo = opening ? 0 : Math.min(state.currentBet + state.lastRaiseSize, maxTo);

  return {
    player: index,
    types,
    callAmount,
    callTo: toCall,
    minBetTo,
    minRaiseTo,
    maxTo,
    allInAmount,
  };
}

function describe(action: Action): string {
  return action.type === 'bet' || action.type === 'raise'
    ? `${action.type} to ${action.to}`
    : action.type;
}

/**
 * Applies one action and advances the hand as far as it can go (dealing the
 * next street, running the board out when everyone is all-in, settling).
 * Returns a new state; the input is untouched.
 */
export function applyAction(
  state: HandState,
  action: Action,
  expectedPlayer?: PlayerIndex,
): HandState {
  if (state.complete) throw new Error('The hand is already complete');
  if (state.toAct === null) throw new Error('No player is to act');
  if (expectedPlayer !== undefined && expectedPlayer !== state.toAct) {
    throw new Error(`It is player ${state.toAct}'s turn, not player ${expectedPlayer}'s`);
  }

  const draft: HandState = structuredClone(state);
  const index = draft.toAct!;
  const player = draft.players[index];
  const legal = legalActionsFor(draft, index);

  const resolved = resolveAction(draft, legal, action);
  if (!legal.types.includes(resolved.type)) {
    throw new Error(`Illegal action ${describe(action)}: legal actions are ${legal.types.join(', ')}`);
  }

  switch (resolved.type) {
    case 'fold': {
      player.status = 'folded';
      player.hasActedThisStreet = true;
      draft.events.push({ kind: 'action', player: index, action: 'fold', amount: 0, allIn: false });
      break;
    }
    case 'check': {
      player.hasActedThisStreet = true;
      draft.events.push({ kind: 'action', player: index, action: 'check', amount: 0, allIn: false });
      break;
    }
    case 'call': {
      const amount = commit(draft, index, legal.callTo);
      player.hasActedThisStreet = true;
      draft.events.push({
        kind: 'action',
        player: index,
        action: 'call',
        to: player.committedThisStreet,
        amount,
        allIn: player.status === 'all-in',
      });
      break;
    }
    case 'bet':
    case 'raise': {
      const to = resolved.to;
      validateRaiseSize(legal, resolved.type, to);
      const previousBet = draft.currentBet;
      const amount = commit(draft, index, to);
      const increment = to - previousBet;
      const full = increment >= draft.lastRaiseSize;

      draft.currentBet = to;
      if (full) {
        draft.lastRaiseSize = increment;
        draft.incompleteRaise = false;
        draft.players[other(index)].hasActedThisStreet = false;
      } else {
        // A short all-in does not reopen the betting for anyone who has acted.
        draft.incompleteRaise = true;
      }
      player.hasActedThisStreet = true;
      draft.events.push({
        kind: 'action',
        player: index,
        action: resolved.type,
        to,
        amount,
        allIn: player.status === 'all-in',
      });
      break;
    }
  }

  // Heads-up, the opponent is always next — if they still have a decision left.
  draft.toAct = draft.players[other(index)].status === 'active' ? other(index) : null;
  advance(draft);
  return draft;
}

type ResolvedAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number };

/** Turns the `all-in` shorthand into the concrete action it stands for. */
function resolveAction(state: HandState, legal: LegalActions, action: Action): ResolvedAction {
  if (action.type !== 'all-in') {
    if (action.type === 'bet' || action.type === 'raise') {
      if (!Number.isInteger(action.to)) throw new Error(`Bet size must be an integer, got ${action.to}`);
      return { type: action.type, to: action.to };
    }
    return { type: action.type };
  }
  const to = legal.maxTo;
  if (to > legal.callTo && legal.types.includes(state.currentBet === 0 ? 'bet' : 'raise')) {
    return state.currentBet === 0 ? { type: 'bet', to } : { type: 'raise', to };
  }
  return legal.callAmount > 0 ? { type: 'call' } : { type: 'check' };
}

function validateRaiseSize(legal: LegalActions, type: 'bet' | 'raise', to: number): void {
  const min = type === 'bet' ? legal.minBetTo : legal.minRaiseTo;
  if (to > legal.maxTo) {
    throw new Error(`Cannot ${type} to ${to}: the effective maximum is ${legal.maxTo}`);
  }
  // Anything below the minimum is only allowed as an all-in for the last chip.
  if (to < min && to !== legal.maxTo) {
    throw new Error(`Cannot ${type} to ${to}: the minimum is ${min}`);
  }
}

/** Moves a player's street total up to `to`, updating the pot. */
function commit(state: HandState, index: PlayerIndex, to: number): number {
  const player = state.players[index];
  const amount = to - player.committedThisStreet;
  if (amount < 0) throw new Error('Cannot un-commit chips');
  if (amount > player.stack) throw new Error('Not enough chips');
  player.stack -= amount;
  player.committedThisStreet += amount;
  player.committedTotal += amount;
  state.pot += amount;
  if (player.stack === 0) player.status = 'all-in';
  return amount;
}

/** True once nobody can act again on this street. */
function bettingRoundComplete(state: HandState): boolean {
  const [a, b] = state.players;
  if (a.status === 'folded' || b.status === 'folded') return true;

  const stillBetting = contesting(state);
  for (const player of state.players) {
    if (player.status === 'folded') continue;
    if (player.committedThisStreet < callTarget(state, player.index)) return false;
  }
  // Betting needs at least two players with chips behind; with one or none, the
  // street is over as soon as everything is matched.
  if (stillBetting.length <= 1) return true;
  return stillBetting.every((player) => player.hasActedThisStreet);
}

/**
 * Returns the part of a bet the opponent never matched. With only two players
 * any excess over the opponent's street total is by definition uncalled.
 */
function returnUncalled(state: HandState): void {
  const [a, b] = state.players;
  const high = a.committedThisStreet > b.committedThisStreet ? a : b;
  const low = high === a ? b : a;
  const excess = high.committedThisStreet - low.committedThisStreet;
  if (excess <= 0) return;
  high.stack += excess;
  high.committedThisStreet -= excess;
  high.committedTotal -= excess;
  state.pot -= excess;
  if (high.stack > 0 && high.status === 'all-in') high.status = 'active';
  state.events.push({ kind: 'return', player: high.index, amount: excess });
}

function startStreet(state: HandState, street: Exclude<Street, 'preflop'>): void {
  const count = street === 'flop' ? 3 : 1;
  const cards = state.deck.splice(0, count);
  if (cards.length < count) throw new Error('Deck exhausted');
  state.board.push(...cards);
  state.street = street;
  state.currentBet = 0;
  state.lastRaiseSize = state.config.bigBlind;
  state.incompleteRaise = false;
  for (const player of state.players) {
    player.committedThisStreet = 0;
    player.hasActedThisStreet = false;
  }
  state.events.push({ kind: 'deal-board', street, cards });
}

/** First player still able to act on this street, in the right order. */
function firstActor(state: HandState, phase: 'preflop' | 'postflop'): PlayerIndex | null {
  const first = firstToAct(state.config.positions, state.config.tableSize, phase);
  if (state.players[first].status === 'active') return first;
  const second = other(first);
  return state.players[second].status === 'active' ? second : null;
}

/** Drives the hand forward until a player has a decision to make, or it ends. */
function advance(state: HandState): void {
  for (;;) {
    if (state.complete) return;

    if (!bettingRoundComplete(state)) {
      if (state.toAct === null || state.players[state.toAct].status !== 'active') {
        state.toAct = firstActor(state, state.street === 'preflop' ? 'preflop' : 'postflop');
      }
      if (state.toAct === null) {
        throw new Error('Betting round is unfinished but nobody can act');
      }
      return;
    }

    returnUncalled(state);

    const folded = state.players.find((p) => p.status === 'folded');
    if (folded) {
      settleFold(state, other(folded.index));
      return;
    }

    if (state.street === 'river') {
      settleShowdown(state);
      return;
    }

    const nextStreet = STREETS[STREETS.indexOf(state.street) + 1] as Exclude<Street, 'preflop'>;
    startStreet(state, nextStreet);
    state.toAct = firstActor(state, 'postflop');
  }
}

function settleFold(state: HandState, winner: PlayerIndex): void {
  const amount = state.pot;
  state.players[winner].stack += amount;
  state.pot = 0;
  state.toAct = null;
  state.complete = true;
  state.events.push({ kind: 'award', player: winner, amount, reason: 'fold' });
  state.result = {
    winners: [winner],
    awarded: winner === 0 ? [amount, 0] : [0, amount],
    net: netOf(state),
    wentToShowdown: false,
    hands: null,
  };
}

function settleShowdown(state: HandState): void {
  const [a, b] = state.players;
  const handA = evaluateHand([...a.holeCards!, ...state.board]);
  const handB = evaluateHand([...b.holeCards!, ...state.board]);

  state.events.push(
    { kind: 'show', player: 0, cards: a.holeCards!, description: handA.description },
    { kind: 'show', player: 1, cards: b.holeCards!, description: handB.description },
  );

  const pot = state.pot;
  const awarded: [number, number] = [0, 0];
  let winners: PlayerIndex[];

  if (handA.value === handB.value) {
    const half = Math.floor(pot / 2);
    const odd = pot - half * 2;
    // The odd chip goes to the first seat left of the button — the player who
    // acts first postflop.
    const oddChipTo = firstToAct(state.config.positions, state.config.tableSize, 'postflop');
    awarded[0] = half + (oddChipTo === 0 ? odd : 0);
    awarded[1] = half + (oddChipTo === 1 ? odd : 0);
    winners = [0, 1];
    a.stack += awarded[0];
    b.stack += awarded[1];
    state.events.push(
      { kind: 'award', player: 0, amount: awarded[0], reason: 'split' },
      { kind: 'award', player: 1, amount: awarded[1], reason: 'split' },
    );
  } else {
    const winner: PlayerIndex = handA.value > handB.value ? 0 : 1;
    awarded[winner] = pot;
    state.players[winner].stack += pot;
    winners = [winner];
    state.events.push({ kind: 'award', player: winner, amount: pot, reason: 'showdown' });
  }

  state.pot = 0;
  state.toAct = null;
  state.complete = true;
  state.result = {
    winners,
    awarded,
    net: netOf(state),
    wentToShowdown: true,
    hands: [handA, handB],
  };
}

function netOf(state: HandState): [number, number] {
  return [
    state.players[0].stack - state.players[0].startingStack,
    state.players[1].stack - state.players[1].startingStack,
  ];
}

/**
 * Normalises a freshly created hand: if nobody has a decision to make (both
 * players all-in from their blinds, say) the board runs out immediately.
 */
export function normalizeNewHand(state: HandState): HandState {
  const draft = structuredClone(state);
  advance(draft);
  return draft;
}

/** Chips that were in the middle before the current street's betting. */
export function settledPot(state: HandView): number {
  return state.pot - state.players[0].committedThisStreet - state.players[1].committedThisStreet;
}
