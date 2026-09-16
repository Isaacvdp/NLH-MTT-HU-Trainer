/**
 * Smoke tests that drive the real UI: fill in the setup screen, deal a hand and
 * play it out through the buttons a player would actually press.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { DisplayProvider } from './display.js';
import { RangeLibraryProvider } from './ranges.js';

/** The app always runs inside the display-preferences provider. */
const renderApp = () =>
  render(
    <DisplayProvider>
      <RangeLibraryProvider>
        <App />
      </RangeLibraryProvider>
    </DisplayProvider>,
  );

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

/** Renders the app and walks to the hot-seat setup screen. */
async function openHotSeat() {
  const user = userEvent.setup();
  renderApp();
  await user.click(screen.getByRole('button', { name: 'Start a hot-seat session' }));
  return user;
}

async function dealFirstHand() {
  const user = await openHotSeat();
  await user.click(screen.getByRole('button', { name: 'Deal first hand' }));
  return user;
}

const table = (): HTMLElement => document.querySelector('.table') as HTMLElement;
const liveSeats = () => table().querySelectorAll('.seat:not(.dead-seat)');
const boardCards = () => table().querySelectorAll('.board .card:not(.empty)');

describe('home screen', () => {
  it('offers both ways to play', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /MTT Spot Trainer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create or join a room' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a hot-seat session' })).toBeTruthy();
  });

  it('opens the lobby with both ways in', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Create or join a room' }));
    expect(screen.getByRole('button', { name: 'Set up a new room' })).toBeTruthy();
    expect(screen.getByLabelText('Room code')).toBeTruthy();
  });

  it('opens the lobby straight from a share link, with the code filled in', () => {
    window.history.pushState({}, '', '/room/ABC123');
    renderApp();
    expect((screen.getByLabelText('Room code') as HTMLInputElement).value).toBe('ABC123');
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
  });

  it('takes a lowercase share link and normalises the code', () => {
    window.history.pushState({}, '', '/room/abc123');
    renderApp();
    expect((screen.getByLabelText('Room code') as HTMLInputElement).value).toBe('ABC123');
  });
});

describe('setup screen', () => {
  it('shows the default spot and explains the ante', async () => {
    await openHotSeat();
    expect((screen.getByLabelText('Preset') as HTMLSelectElement).value).toBe('btn-vs-bb');
    expect(screen.getByText(/big blind posts one ante for the table/i)).toBeTruthy();
  });

  it('keeps the spot valid when the table shrinks', async () => {
    const user = await openHotSeat();
    const preset = screen.getByLabelText('Preset') as HTMLSelectElement;
    await user.selectOptions(preset, 'utg-vs-bb');
    expect(preset.value).toBe('utg-vs-bb');

    // UTG does not exist 4-handed, so the spot falls back to BTN vs BB.
    await user.selectOptions(screen.getByLabelText('Table size'), '4');
    expect((screen.getByLabelText('Preset') as HTMLSelectElement).value).toBe('btn-vs-bb');
  });
});

describe('the table', () => {
  it('draws every seat at the table, not just the two in play', async () => {
    await dealFirstHand();
    // Nine seats: two live, seven folded.
    expect(table().querySelectorAll('.seat')).toHaveLength(9);
    expect(liveSeats()).toHaveLength(2);
    expect(table().querySelectorAll('.dead-seat')).toHaveLength(7);
  });

  it('shows the dead money in front of the seat it came from', async () => {
    await dealFirstHand();
    // The folded small blind left 50 behind; the big-blind ante is posted by a
    // live player, so it is not a dead chip.
    const dead = [...table().querySelectorAll('.chip.dead')].map((chip) => chip.textContent);
    expect(dead).toContain('50');
  });

  it('counts the whole pot in the middle, antes and live bets included', async () => {
    await dealFirstHand();
    // Dead small blind 50, big-blind ante 100, and the big blind itself 100.
    expect(table().querySelector('.pot-value')?.textContent).toBe('250');
  });

  it('sweeps the dead chips into the pot once preflop is over', async () => {
    const user = await dealFirstHand();
    expect(table().querySelectorAll('.chip.dead').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /^Call/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // On the flop the dead money is in the middle, not in front of a seat.
    expect(table().querySelectorAll('.chip.dead')).toHaveLength(0);
    expect(table().querySelectorAll('.chip')).toHaveLength(0);
  });

  it('marks the dealer and the player to act', async () => {
    await dealFirstHand();
    expect(table().querySelectorAll('.dealer')).toHaveLength(1);
    const toAct = table().querySelector('.seat.to-act');
    expect(toAct?.textContent).toContain('BTN');
  });

  it('puts the hero seat at the bottom of the table', async () => {
    await dealFirstHand();
    const slots = [...table().querySelectorAll('.seat-slot')] as HTMLElement[];
    const hero = slots.find((slot) => slot.textContent?.includes('BTN'))!;
    // Seat 0 is the hero in hot seat, and the bottom of the box is 50%/87%.
    expect(hero.style.top.startsWith('87')).toBe(true);
    expect(hero.style.left).toBe('50%');
  });
});

describe('pot odds', () => {
  const odds = () => document.querySelector('.pot-odds.facing')?.textContent ?? '';
  const laying = () => document.querySelector('.pot-odds.laying')?.textContent ?? '';

  it('prices the call the player is facing', async () => {
    await dealFirstHand();
    // 100 to call into a pot of 250 means you need 29% to break even.
    expect(odds()).toBe('29%2.5 : 1');
  });

  it('says nothing when there is nothing to call', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: /^Call/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    // First to act on the flop with no bet in front of them.
    expect(document.querySelector('.pot-odds.facing')).toBeNull();
  });

  it('prices what the chosen size would lay the opponent, and follows the slider', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: /^Call/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // A pot-sized bet lays 2 : 1, so the opponent needs a third.
    await user.click(screen.getByRole('button', { name: '100%' }));
    expect(laying()).toContain('2 : 1');
    expect(laying()).toContain('33%');

    // Drag to half the pot and they only need a quarter.
    fireEvent.change(screen.getByLabelText('Bet size'), { target: { value: '175' } });
    expect(laying()).toContain('3 : 1');
    expect(laying()).toContain('25%');
  });

  it('updates on every street', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: /^Call/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // Big blind bets the pot on the flop; the button is priced at 33%.
    await user.click(screen.getByRole('button', { name: '100%' }));
    await user.click(screen.getByRole('button', { name: /^Bet/ }));
    expect(odds()).toContain('33%');
    expect(odds()).toContain('2 : 1');
  });
});

describe('ranges', () => {
  const gridFor = (position: string): HTMLElement =>
    document.querySelector(`[aria-label="${position} range"]`) as HTMLElement;

  it('gives each seat a range shaped to its position', async () => {
    await openHotSeat();
    expect(gridFor('BTN')).toBeTruthy();
    expect(gridFor('BB')).toBeTruthy();

    // 169 cells each, and the button opens far wider than an early seat would.
    expect(gridFor('BTN').querySelectorAll('.cell')).toHaveLength(169);
    const on = gridFor('BTN').querySelectorAll('.cell.on').length;
    expect(on).toBeGreaterThan(40);
    expect(on).toBeLessThan(169);
  });

  it('follows the seat when the position changes', async () => {
    const user = await openHotSeat();
    const buttonCells = gridFor('BTN').querySelectorAll('.cell.on').length;

    await user.selectOptions(screen.getByLabelText('Seat 1'), 'UTG');
    const utgCells = gridFor('UTG').querySelectorAll('.cell.on').length;
    expect(utgCells).toBeLessThan(buttonCells);
  });

  it('toggles a hand on and off by clicking its cell', async () => {
    const user = await openHotSeat();
    const grid = gridFor('BTN');
    const aces = within(grid).getByTitle('AA');
    expect(aces.getAttribute('aria-pressed')).toBe('true');

    await user.click(aces);
    expect(within(gridFor('BTN')).getByTitle('AA').getAttribute('aria-pressed')).toBe('false');
  });

  it('sets a range to the top slice of hands', async () => {
    const user = await openHotSeat();
    const slider = screen.getByLabelText('Top percent of hands for BTN');
    fireEvent.change(slider, { target: { value: '10' } });

    const grid = gridFor('BTN');
    expect(within(grid).getByTitle('AA').getAttribute('aria-pressed')).toBe('true');
    expect(within(grid).getByTitle('72o').getAttribute('aria-pressed')).toBe('false');
    expect(grid.parentElement!.textContent).toMatch(/10\.\d% ยท|10\.\d%/);

    await user.click(within(grid.parentElement!).getByRole('button', { name: 'Any two' }));
    expect(gridFor('BTN').querySelectorAll('.cell.on')).toHaveLength(169);
  });

  it('copies a range to the other seat', async () => {
    const user = await openHotSeat();
    const onIn = (position: string) => gridFor(position).querySelectorAll('.cell.on').length;

    const before = onIn('BB');
    expect(onIn('BTN')).not.toBe(before);

    await user.click(screen.getByRole('button', { name: 'Copy to BB' }));
    expect(onIn('BB')).toBe(onIn('BTN'));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('saves a range as the default for that seat and reuses it', async () => {
    const user = await openHotSeat();

    // Narrow the button right down, then save it.
    fireEvent.change(screen.getByLabelText('Top percent of hands for BTN'), {
      target: { value: '10' },
    });
    const narrowed = gridFor('BTN').querySelectorAll('.cell.on').length;
    await user.click(within(gridFor('BTN').parentElement!).getByRole('button', { name: 'Save' }));
    expect(screen.getByText('saved')).toBeTruthy();

    // Switching away and back rebuilds the range from the saved one, not the
    // built-in button range.
    await user.selectOptions(screen.getByLabelText('Seat 1'), 'CO');
    await user.selectOptions(screen.getByLabelText('Seat 1'), 'BTN');
    expect(gridFor('BTN').querySelectorAll('.cell.on')).toHaveLength(narrowed);
  });

  it('forgets a saved range and goes back to the built-in one', async () => {
    const user = await openHotSeat();
    const builtIn = gridFor('BTN').querySelectorAll('.cell.on').length;

    fireEvent.change(screen.getByLabelText('Top percent of hands for BTN'), {
      target: { value: '10' },
    });
    await user.click(within(gridFor('BTN').parentElement!).getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Forget saved' }));

    expect(screen.queryByText('saved')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Seat 1'), 'CO');
    await user.selectOptions(screen.getByLabelText('Seat 1'), 'BTN');
    expect(gridFor('BTN').querySelectorAll('.cell.on')).toHaveLength(builtIn);
  });

  it('only deals hands from the range', async () => {
    const user = await openHotSeat();
    // Narrow the button right down, then check what it is dealt.
    const slider = screen.getByLabelText('Top percent of hands for BTN');
    fireEvent.change(slider, { target: { value: '1' } });

    await user.click(screen.getByRole('button', { name: 'Deal first hand' }));
    const cards = [...table().querySelectorAll('.seat-slot')]
      .find((slot) => slot.textContent?.includes('BTN'))!
      .querySelectorAll('.card[data-suit]');
    const ranks = [...cards].map((card) => card.getAttribute('aria-label')![0]);
    // The top 1% is aces, kings and queens, so both cards are the same big pair.
    expect(ranks[0]).toBe(ranks[1]);
    expect(['A', 'K', 'Q']).toContain(ranks[0]);
  });
});

describe('display preferences', () => {
  it('switches amounts between chips and big blinds', async () => {
    const user = await dealFirstHand();
    expect(screen.getByRole('button', { name: /^Call 100/ })).toBeTruthy();

    await user.click(screen.getByText('Chips'));
    // 100 chips at a 100 big blind reads as 1bb.
    expect(screen.getByRole('button', { name: /^Call 1bb/ })).toBeTruthy();
    expect(screen.getByText(/Player 2 posts the big blind 1bb/)).toBeTruthy();

    await user.click(screen.getByText('Big blinds'));
    expect(screen.getByRole('button', { name: /^Call 100/ })).toBeTruthy();
  });

  it('accepts a size typed in big blinds', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByText('Chips'));

    const amount = screen.getByLabelText('Raise to') as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '2.75');
    fireEvent.blur(amount);
    await user.click(screen.getByRole('button', { name: /^Raise to/ }));
    // 2.75bb of a 100 big blind is 275 chips.
    expect(screen.getByText('Player 1 raises to 2.8bb')).toBeTruthy();
  });

  it('switches the deck between two and four colours', async () => {
    const user = await dealFirstHand();
    expect(document.documentElement.dataset['deck']).toBe('two');

    await user.click(screen.getByText('2-colour'));
    expect(document.documentElement.dataset['deck']).toBe('four');

    await user.click(screen.getByText('4-colour'));
    expect(document.documentElement.dataset['deck']).toBe('two');
  });

  it('tags every card with its suit so the palette can colour it', async () => {
    await dealFirstHand();
    const faceUp = [...table().querySelectorAll('.card[data-suit]')];
    expect(faceUp.length).toBeGreaterThan(0);
    for (const card of faceUp) {
      expect(['s', 'h', 'd', 'c']).toContain(card.getAttribute('data-suit'));
    }
  });
});

describe('playing a hand', () => {
  it('deals with the right dead money and action order', async () => {
    await dealFirstHand();

    // 9-handed, BTN vs BB, 50/100 with a 100 big blind ante: the dead small
    // blind is 50, the big blind posts 100 plus a 100 ante.
    expect(screen.getByText('Dead small blind: 50')).toBeTruthy();
    expect(screen.getByText('Player 2 posts the ante 100')).toBeTruthy();
    expect(screen.getByText('Player 2 posts the big blind 100')).toBeTruthy();

    // The button acts first preflop.
    expect(screen.getByText(/Player 1 to act — preflop/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Call 100/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
  });

  it('shows only the acting player cards while hiding the waiting one', async () => {
    await dealFirstHand();
    const seats = liveSeats();
    expect(seats).toHaveLength(2);
    // The button is to act, so their two cards are face up and the big blind's are not.
    const slots = table().querySelectorAll('.seat-slot');
    const live = [...slots].filter((slot) => slot.querySelector('.seat:not(.dead-seat)'));
    expect(live[0]!.querySelectorAll('.card:not(.hidden):not(.empty)')).toHaveLength(2);
    expect(live[1]!.querySelectorAll('.card.hidden')).toHaveLength(2);
  });

  it('plays through to a flop and swaps who acts', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: /^Call 100/ }));

    // The big blind has the option.
    expect(screen.getByText(/Player 2 to act — preflop/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // Postflop the big blind acts first.
    expect(screen.getByText(/Player 2 to act — flop/)).toBeTruthy();
    expect(boardCards()).toHaveLength(3);
  });

  it('offers multiples of the bet preflop and fractions of the pot after', async () => {
    const user = await dealFirstHand();
    const presets = () => [...document.querySelectorAll('.sizes .size')].map((b) => b.textContent);

    expect(presets()).toEqual(['2x', '2.2x', '2.5x', '3x', 'Max']);

    await user.click(screen.getByRole('button', { name: /^Call/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // Postflop the presets switch to pot fractions; Max stays at the end.
    expect(presets()).toEqual(['25%', '40%', '66%', '100%', 'Max']);
  });

  it('sets the size from a preset and commits it with the raise button', async () => {
    const user = await dealFirstHand();
    const raiseButton = screen.getByRole('button', { name: /^Raise to/ });

    // The size starts at the minimum raise and follows whichever preset is picked.
    expect(raiseButton.textContent).toContain('200');
    await user.click(screen.getByRole('button', { name: '2.5x' }));
    expect(screen.getByRole('button', { name: /^Raise to/ }).textContent).toContain('250');

    await user.click(screen.getByRole('button', { name: /^Raise to/ }));
    expect(screen.getByText('Player 1 raises to 250')).toBeTruthy();
  });

  it('fine-tunes the size with the slider and the amount box', async () => {
    const user = await dealFirstHand();
    const slider = screen.getByLabelText('Raise size') as HTMLInputElement;
    expect(slider.min).toBe('200');
    // 40bb stacks, and the big blind is already 200 in, so the effective
    // maximum this street is 3,900.
    expect(slider.max).toBe('3900');

    fireEvent.change(slider, { target: { value: '640' } });
    expect(screen.getByRole('button', { name: /^Raise to/ }).textContent).toContain('640');

    const amount = screen.getByLabelText('Raise to') as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, '2750');
    fireEvent.blur(amount);
    await user.click(screen.getByRole('button', { name: /^Raise to/ }));
    expect(screen.getByText('Player 1 raises to 2,750')).toBeTruthy();
  });

  it('jumps to the effective maximum with the Max button', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: 'Max' }));

    // The button is 40bb deep but the big blind can only cover 3,900, so this
    // is the maximum without being a literal all-in.
    const max = screen.getByRole('button', { name: /^Raise to/ });
    expect(max.textContent).toContain('3,900');
    await user.click(max);
    expect(screen.getByText('Player 1 raises to 3,900')).toBeTruthy();
  });

  it('says All-in only when the size really is the whole stack', async () => {
    const user = await openHotSeat();
    const stack = screen.getByLabelText('Big blinds') as HTMLInputElement;
    await user.clear(stack);
    await user.type(stack, '20');
    await user.click(screen.getByRole('button', { name: 'Deal first hand' }));

    // The button opens; it is the deeper stack, so its maximum is not all-in.
    await user.click(screen.getByRole('button', { name: '2.5x' }));
    await user.click(screen.getByRole('button', { name: /^Raise to/ }));

    // The big blind has paid an ante, so its own stack is the effective one and
    // the maximum really is a shove.
    await user.click(screen.getByRole('button', { name: 'Max' }));
    const shove = screen.getByRole('button', { name: /^All-in/ });
    expect(shove.textContent).toContain('1,900');
    await user.click(shove);
    expect(screen.getByText('Player 2 raises to 1,900 (all-in)')).toBeTruthy();
  });

  it('clamps a typed size that is out of range', async () => {
    const user = await dealFirstHand();
    const amount = screen.getByLabelText('Raise to') as HTMLInputElement;

    // Below the minimum raise snaps up to it.
    await user.clear(amount);
    await user.type(amount, '150');
    fireEvent.blur(amount);
    expect(screen.getByRole('button', { name: /^Raise to/ }).textContent).toContain('200');

    // Above the effective stack snaps down to all-in.
    await user.clear(amount);
    await user.type(amount, '99999');
    fireEvent.blur(amount);
    expect(screen.getByRole('button', { name: /^Raise to/ }).textContent).toContain('3,900');
  });

  it('ends the hand on a fold and offers the next one', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: 'Fold' }));

    // The uncalled blind comes back, so the pot is the dead 50 plus the 100 ante.
    const result = document.querySelector('.result') as HTMLElement;
    expect(within(result).getByText('Player 2 wins 150')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeTruthy();

    // The winnings sit on the felt in front of the winner, and nothing else does.
    const chips = [...table().querySelectorAll('.chip')].map((chip) => chip.textContent);
    expect(chips).toEqual(['+150']);
    expect(table().querySelector('.chip.won')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Hand #1 · BTN vs BB/ })).toBeTruthy();
  });

  it('swaps seats between hands and logs the finished hand', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: 'Fold' }));
    await user.click(screen.getByRole('button', { name: 'Next hand' }));

    // Seats swapped, so player 2 is now on the button and acts first.
    expect(screen.getByText(/Player 2 to act — preflop/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Hand #2 · BTN vs BB/ })).toBeTruthy();

    // The finished hand is available as PokerStars text.
    const history = document.querySelector('pre.history') as HTMLElement;
    expect(history.textContent).toContain("PokerStars Hand #1: Tournament #MTT-SPOT, Hold'em No Limit");
    // Hand #1 keeps the names from the seating it was played with, not the swap.
    expect(history.textContent).toContain('Player 1: folds');
    expect(history.textContent).toContain('Player 2 collected 150 from pot');
  });

  it('runs an all-in hand out to showdown and reveals both hands', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: 'Max' }));
    await user.click(screen.getByRole('button', { name: /^Raise to/ }));
    await user.click(screen.getByRole('button', { name: /^Call/ }));

    expect(boardCards()).toHaveLength(5);
    expect(table().querySelectorAll('.card.hidden')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeTruthy();
  });
});
