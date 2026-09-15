/**
 * Smoke tests that drive the real UI: fill in the setup screen, deal a hand and
 * play it out through the buttons a player would actually press.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';

afterEach(cleanup);

async function dealFirstHand() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Deal first hand' }));
  return user;
}

const felt = (): HTMLElement => document.querySelector('.felt') as HTMLElement;

describe('setup screen', () => {
  it('shows the default spot and its presets', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /MTT Spot Trainer/ })).toBeTruthy();
    expect(screen.getByText(/BTN vs BB \(9-handed\)/)).toBeTruthy();
    expect(screen.getByText(/big blind seat posts one ante/i)).toBeTruthy();
  });

  it('keeps the spot valid when the table shrinks', async () => {
    const user = userEvent.setup();
    render(<App />);
    const preset = screen.getByLabelText('Preset') as HTMLSelectElement;
    await user.selectOptions(preset, 'utg-vs-bb');
    expect(screen.getByText(/UTG vs BB \(9-handed\)/)).toBeTruthy();

    // UTG does not exist 4-handed, so the spot falls back to BTN vs BB.
    await user.selectOptions(screen.getByLabelText('Table size'), '4');
    expect(screen.getByText(/BTN vs BB \(4-handed\)/)).toBeTruthy();
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
    const seats = felt().querySelectorAll('.seat');
    expect(seats).toHaveLength(2);
    // The button is to act, so their two cards are face up and the big blind's are not.
    expect(seats[0]!.querySelectorAll('.card:not(.hidden)')).toHaveLength(2);
    expect(seats[1]!.querySelectorAll('.card.hidden')).toHaveLength(2);
  });

  it('plays through to a flop and swaps who acts', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: /^Call 100/ }));

    // The big blind has the option.
    expect(screen.getByText(/Player 2 to act — preflop/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Check' }));

    // Postflop the big blind acts first.
    expect(screen.getByText(/Player 2 to act — flop/)).toBeTruthy();
    expect(felt().querySelectorAll('.board .card:not(.empty)')).toHaveLength(3);
  });

  it('offers sizing buttons and a custom raise', async () => {
    const user = await dealFirstHand();
    const sizes = document.querySelector('.sizes') as HTMLElement;
    expect(within(sizes).getByRole('button', { name: /^Min/ })).toBeTruthy();
    expect(within(sizes).getByRole('button', { name: /^2\.5x/ })).toBeTruthy();
    expect(within(sizes).getByRole('button', { name: /^All-in/ })).toBeTruthy();

    const custom = screen.getByLabelText('Raise to') as HTMLInputElement;
    const raiseButton = screen.getByRole('button', { name: 'Raise to' });
    expect(raiseButton.hasAttribute('disabled')).toBe(true);

    // Below the minimum raise stays disabled.
    await user.type(custom, '150');
    expect(raiseButton.hasAttribute('disabled')).toBe(true);

    await user.clear(custom);
    await user.type(custom, '275');
    expect(raiseButton.hasAttribute('disabled')).toBe(false);
    await user.click(raiseButton);
    expect(screen.getByText('Player 1 raises to 275')).toBeTruthy();
  });

  it('ends the hand on a fold and offers the next one', async () => {
    const user = await dealFirstHand();
    await user.click(screen.getByRole('button', { name: 'Fold' }));

    // The uncalled blind comes back, so the pot is the dead 50 plus the 100 ante.
    const result = document.querySelector('.result') as HTMLElement;
    expect(within(result).getByText('Player 2 wins 150')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeTruthy();
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
    const sizes = document.querySelector('.sizes') as HTMLElement;
    await user.click(within(sizes).getByRole('button', { name: /^All-in/ }));
    await user.click(screen.getByRole('button', { name: /^Call/ }));

    expect(felt().querySelectorAll('.board .card:not(.empty)')).toHaveLength(5);
    expect(felt().querySelectorAll('.seat .card.hidden')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Next hand' })).toBeTruthy();
  });
});
