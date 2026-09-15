import { toBigBlinds } from 'engine';

export function chips(amount: number): string {
  return amount.toLocaleString('en-US');
}

/** `'4,000 (40bb)'` — chips first, big blinds in brackets. */
export function chipsWithBb(amount: number, bigBlind: number): string {
  return `${chips(amount)} (${toBigBlinds(amount, bigBlind)})`;
}

export function signed(amount: number): string {
  return amount > 0 ? `+${chips(amount)}` : chips(amount);
}
