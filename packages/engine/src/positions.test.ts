import { describe, expect, it } from 'vitest';
import {
  buttonPosition,
  firstToAct,
  inPositionIndex,
  isPositionAtTable,
  postflopOrder,
  preflopOrder,
} from './positions.js';

describe('table layouts', () => {
  it('lists preflop order with UTG first and BB last', () => {
    expect(preflopOrder(9)).toEqual(['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(preflopOrder(6)).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(preflopOrder(3)).toEqual(['BTN', 'SB', 'BB']);
    expect(preflopOrder(2)).toEqual(['SB', 'BB']);
  });

  it('lists postflop order starting left of the button', () => {
    expect(postflopOrder(9)).toEqual(['SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN']);
    expect(postflopOrder(6)).toEqual(['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']);
    expect(postflopOrder(3)).toEqual(['SB', 'BB', 'BTN']);
  });

  it('treats the small blind as the button when 2-handed', () => {
    expect(buttonPosition(2)).toBe('SB');
    expect(buttonPosition(6)).toBe('BTN');
    // Heads-up the big blind is the first seat left of the button.
    expect(postflopOrder(2)).toEqual(['BB', 'SB']);
  });

  it('knows which seats exist', () => {
    expect(isPositionAtTable('UTG', 6)).toBe(true);
    expect(isPositionAtTable('UTG', 5)).toBe(false);
    expect(isPositionAtTable('LJ', 6)).toBe(false);
    expect(isPositionAtTable('LJ', 7)).toBe(true);
  });

  it('rejects impossible table sizes', () => {
    expect(() => preflopOrder(1)).toThrow();
    expect(() => preflopOrder(10)).toThrow();
    expect(() => preflopOrder(6.5)).toThrow();
  });
});

describe('action order', () => {
  it('BTN vs BB: button first preflop, big blind first postflop', () => {
    const spot = ['BTN', 'BB'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(0);
    expect(firstToAct(spot, 9, 'postflop')).toBe(1);
    expect(inPositionIndex(spot, 9)).toBe(0);
  });

  it('respects the order the two seats were given in', () => {
    const spot = ['BB', 'BTN'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(1);
    expect(firstToAct(spot, 9, 'postflop')).toBe(0);
  });

  it('SB vs BB at a full table: small blind acts first on every street', () => {
    const spot = ['SB', 'BB'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(0);
    expect(firstToAct(spot, 9, 'postflop')).toBe(0);
  });

  it('SB vs BB heads-up: small blind is the button, so the big blind acts first postflop', () => {
    const spot = ['SB', 'BB'] as const;
    expect(firstToAct(spot, 2, 'preflop')).toBe(0);
    expect(firstToAct(spot, 2, 'postflop')).toBe(1);
  });

  it('CO vs BB: cutoff first preflop, big blind first postflop', () => {
    const spot = ['CO', 'BB'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(0);
    expect(firstToAct(spot, 9, 'postflop')).toBe(1);
  });

  it('CO vs BTN: cutoff acts first on every street', () => {
    const spot = ['CO', 'BTN'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(0);
    expect(firstToAct(spot, 9, 'postflop')).toBe(0);
  });

  it('BTN vs SB: button first preflop, small blind first postflop', () => {
    const spot = ['BTN', 'SB'] as const;
    expect(firstToAct(spot, 9, 'preflop')).toBe(0);
    expect(firstToAct(spot, 9, 'postflop')).toBe(1);
  });
});
