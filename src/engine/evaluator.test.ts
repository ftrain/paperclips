/**
 * Tests for the Expression Evaluator
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  evaluateCondition,
  getStateValue,
  setStateValue,
  formatValue,
  formatCompact,
} from './evaluator';
import type { Expression, Condition, EvaluationContext, GameState } from '../types/game';

// Helper to create a test context
function createContext(state: GameState = {}): EvaluationContext {
  return {
    state,
    tick: 0,
    deltaTime: 10,
    random: () => 0.5, // Fixed random for testing
  };
}

describe('getStateValue', () => {
  it('should get simple values', () => {
    const state: GameState = { clips: 100, funds: 50.5 };
    expect(getStateValue(state, 'clips')).toBe(100);
    expect(getStateValue(state, 'funds')).toBe(50.5);
  });

  it('should return undefined for missing values', () => {
    const state: GameState = { clips: 100 };
    expect(getStateValue(state, 'missing')).toBeUndefined();
  });
});

describe('setStateValue', () => {
  it('should set simple values', () => {
    const state: GameState = { clips: 0 };
    setStateValue(state, 'clips', 100);
    expect(state.clips).toBe(100);
  });

  it('should create new values', () => {
    const state: GameState = {};
    setStateValue(state, 'newValue', 42);
    expect(state.newValue).toBe(42);
  });
});

describe('evaluateExpression', () => {
  it('should evaluate literal numbers', () => {
    const ctx = createContext();
    expect(evaluateExpression(42, ctx)).toBe(42);
    expect(evaluateExpression(3.14, ctx)).toBe(3.14);
    expect(evaluateExpression(-10, ctx)).toBe(-10);
  });

  it('should evaluate literal strings', () => {
    const ctx = createContext();
    expect(evaluateExpression('hello', ctx)).toBe('hello');
  });

  it('should evaluate literal booleans', () => {
    const ctx = createContext();
    expect(evaluateExpression(true, ctx)).toBe(true);
    expect(evaluateExpression(false, ctx)).toBe(false);
  });

  it('should evaluate state references', () => {
    const ctx = createContext({ clips: 100, funds: 50 });
    expect(evaluateExpression({ ref: 'clips' }, ctx)).toBe(100);
    expect(evaluateExpression({ ref: 'funds' }, ctx)).toBe(50);
  });

  it('should evaluate arithmetic operations', () => {
    const ctx = createContext();

    // Addition
    expect(evaluateExpression({ op: 'add', args: [1, 2, 3] }, ctx)).toBe(6);

    // Subtraction
    expect(evaluateExpression({ op: 'sub', args: [10, 3] }, ctx)).toBe(7);

    // Multiplication
    expect(evaluateExpression({ op: 'mul', args: [2, 3, 4] }, ctx)).toBe(24);

    // Division
    expect(evaluateExpression({ op: 'div', args: [10, 2] }, ctx)).toBe(5);

    // Modulo
    expect(evaluateExpression({ op: 'mod', args: [7, 3] }, ctx)).toBe(1);

    // Power
    expect(evaluateExpression({ op: 'pow', args: [2, 3] }, ctx)).toBe(8);
  });

  it('should evaluate math functions', () => {
    const ctx = createContext();

    expect(evaluateExpression({ op: 'min', args: [3, 1, 2] }, ctx)).toBe(1);
    expect(evaluateExpression({ op: 'max', args: [3, 1, 2] }, ctx)).toBe(3);
    expect(evaluateExpression({ op: 'floor', args: [3.7] }, ctx)).toBe(3);
    expect(evaluateExpression({ op: 'ceil', args: [3.2] }, ctx)).toBe(4);
    expect(evaluateExpression({ op: 'round', args: [3.5] }, ctx)).toBe(4);
    expect(evaluateExpression({ op: 'abs', args: [-5] }, ctx)).toBe(5);
  });

  it('should evaluate comparison operations', () => {
    const ctx = createContext();

    expect(evaluateExpression({ op: 'eq', args: [5, 5] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'eq', args: [5, 6] }, ctx)).toBe(false);
    expect(evaluateExpression({ op: 'neq', args: [5, 6] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'lt', args: [3, 5] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'lte', args: [5, 5] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'gt', args: [7, 5] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'gte', args: [5, 5] }, ctx)).toBe(true);
  });

  it('should evaluate logical operations', () => {
    const ctx = createContext();

    expect(evaluateExpression({ op: 'and', args: [true, true] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'and', args: [true, false] }, ctx)).toBe(false);
    expect(evaluateExpression({ op: 'or', args: [true, false] }, ctx)).toBe(true);
    expect(evaluateExpression({ op: 'or', args: [false, false] }, ctx)).toBe(false);
    expect(evaluateExpression({ op: 'not', args: [true] }, ctx)).toBe(false);
    expect(evaluateExpression({ op: 'not', args: [false] }, ctx)).toBe(true);
  });

  it('should evaluate conditional expressions', () => {
    const ctx = createContext();

    expect(evaluateExpression({ op: 'if', args: [true, 'yes', 'no'] }, ctx)).toBe('yes');
    expect(evaluateExpression({ op: 'if', args: [false, 'yes', 'no'] }, ctx)).toBe('no');
  });

  it('should evaluate nested expressions', () => {
    const ctx = createContext({ base: 10 });

    const expr: Expression = {
      op: 'add',
      args: [
        { ref: 'base' },
        { op: 'mul', args: [2, 3] }
      ]
    };

    expect(evaluateExpression(expr, ctx)).toBe(16); // 10 + (2 * 3) = 16
  });

  it('should evaluate random with fixed seed', () => {
    const ctx = createContext();
    expect(evaluateExpression({ op: 'random', args: [] }, ctx)).toBe(0.5);
  });
});

describe('evaluateCondition', () => {
  it('should evaluate true/false conditions', () => {
    const ctx = createContext();

    expect(evaluateCondition({ op: 'true' }, ctx)).toBe(true);
    expect(evaluateCondition({ op: 'false' }, ctx)).toBe(false);
  });

  it('should evaluate flag conditions', () => {
    const ctx = createContext({ enabled: true, disabled: false });

    expect(evaluateCondition({ op: 'flag', flag: 'enabled' }, ctx)).toBe(true);
    expect(evaluateCondition({ op: 'flag', flag: 'disabled' }, ctx)).toBe(false);
    expect(evaluateCondition({ op: 'flag', flag: 'missing' }, ctx)).toBe(false);
  });

  it('should evaluate comparison conditions', () => {
    const ctx = createContext({ value: 50 });

    expect(evaluateCondition({
      op: 'gte',
      left: { ref: 'value' },
      right: 25
    }, ctx)).toBe(true);

    expect(evaluateCondition({
      op: 'lt',
      left: { ref: 'value' },
      right: 100
    }, ctx)).toBe(true);

    expect(evaluateCondition({
      op: 'eq',
      left: { ref: 'value' },
      right: 50
    }, ctx)).toBe(true);
  });

  it('should evaluate AND conditions', () => {
    const ctx = createContext({ a: true, b: true, c: false });

    expect(evaluateCondition({
      op: 'and',
      conditions: [
        { op: 'flag', flag: 'a' },
        { op: 'flag', flag: 'b' }
      ]
    }, ctx)).toBe(true);

    expect(evaluateCondition({
      op: 'and',
      conditions: [
        { op: 'flag', flag: 'a' },
        { op: 'flag', flag: 'c' }
      ]
    }, ctx)).toBe(false);
  });

  it('should evaluate OR conditions', () => {
    const ctx = createContext({ a: true, b: false, c: false });

    expect(evaluateCondition({
      op: 'or',
      conditions: [
        { op: 'flag', flag: 'a' },
        { op: 'flag', flag: 'b' }
      ]
    }, ctx)).toBe(true);

    expect(evaluateCondition({
      op: 'or',
      conditions: [
        { op: 'flag', flag: 'b' },
        { op: 'flag', flag: 'c' }
      ]
    }, ctx)).toBe(false);
  });

  it('should evaluate NOT conditions', () => {
    const ctx = createContext({ enabled: true });

    expect(evaluateCondition({
      op: 'not',
      condition: { op: 'flag', flag: 'enabled' }
    }, ctx)).toBe(false);
  });

  it('should evaluate between conditions', () => {
    const ctx = createContext({ value: 50 });

    expect(evaluateCondition({
      op: 'between',
      value: { ref: 'value' },
      min: 25,
      max: 75
    }, ctx)).toBe(true);

    expect(evaluateCondition({
      op: 'between',
      value: { ref: 'value' },
      min: 60,
      max: 100
    }, ctx)).toBe(false);
  });
});

describe('formatValue', () => {
  it('should format numbers', () => {
    expect(formatValue(1234.5678, 'number', 2)).toContain('1,234.57');
  });

  it('should format currency', () => {
    expect(formatValue(1234.5, 'currency', 2)).toBe('$1,234.50');
  });

  it('should format percentages', () => {
    expect(formatValue(0.75, 'percentage', 0)).toBe('75%');
  });

  it('should format booleans', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
  });

  it('should pass through strings', () => {
    expect(formatValue('hello')).toBe('hello');
  });
});

describe('formatCompact', () => {
  it('should format small numbers normally', () => {
    expect(formatCompact(123)).toContain('123');
  });

  it('should format thousands with K', () => {
    expect(formatCompact(1500)).toContain('1.50');
    expect(formatCompact(1500)).toContain('K');
  });

  it('should format millions with M', () => {
    expect(formatCompact(1500000)).toContain('1.50');
    expect(formatCompact(1500000)).toContain('M');
  });

  it('should format billions with B', () => {
    expect(formatCompact(1500000000)).toContain('1.50');
    expect(formatCompact(1500000000)).toContain('B');
  });

  it('should use scientific notation for very large numbers', () => {
    expect(formatCompact(1e50)).toContain('e');
  });
});
