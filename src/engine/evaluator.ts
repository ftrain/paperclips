/**
 * Expression Evaluator
 *
 * Evaluates expressions and conditions against game state.
 * This is the mathematical/logical core of the rules engine.
 */

import type { Expression, Condition, EvaluationContext, GameState } from '../types/game';

/**
 * Get a nested value from state using dot notation
 * e.g., "production.clipRate" -> state.production.clipRate
 */
export function getStateValue(state: GameState, path: string): number | boolean | string | undefined {
  const parts = path.split('.');
  let current: unknown = state;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current as number | boolean | string | undefined;
}

/**
 * Set a nested value in state using dot notation
 */
export function setStateValue(state: GameState, path: string, value: number | boolean | string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = state as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Evaluate an expression to a numeric, boolean, or string value
 */
export function evaluateExpression(expr: Expression, ctx: EvaluationContext): number | boolean | string {
  // Literal values
  if (typeof expr === 'number') return expr;
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'boolean') return expr;

  // State reference
  if ('ref' in expr) {
    const value = getStateValue(ctx.state, expr.ref);
    if (value === undefined) {
      console.warn(`State reference not found: ${expr.ref}`);
      return 0;
    }
    return value;
  }

  // Operation
  if ('op' in expr && 'args' in expr) {
    const args = expr.args.map(arg => evaluateExpression(arg, ctx));
    return evaluateOperation(expr.op, args, ctx);
  }

  console.warn('Unknown expression type:', expr);
  return 0;
}

/**
 * Evaluate a mathematical/logical operation
 */
function evaluateOperation(
  op: string,
  args: (number | boolean | string)[],
  ctx: EvaluationContext
): number | boolean | string {
  // Convert to numbers for math ops
  const nums = args.map(a => typeof a === 'number' ? a : (typeof a === 'boolean' ? (a ? 1 : 0) : parseFloat(a as string) || 0));

  switch (op) {
    // Arithmetic
    case 'add': return nums.reduce((a, b) => a + b, 0);
    case 'sub': return nums.length >= 2 ? nums[0] - nums.slice(1).reduce((a, b) => a + b, 0) : -nums[0];
    case 'mul': return nums.reduce((a, b) => a * b, 1);
    case 'div': return nums.length >= 2 && nums[1] !== 0 ? nums[0] / nums[1] : 0;
    case 'mod': return nums.length >= 2 && nums[1] !== 0 ? nums[0] % nums[1] : 0;
    case 'pow': return nums.length >= 2 ? Math.pow(nums[0], nums[1]) : nums[0];

    // Math functions
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    case 'floor': return Math.floor(nums[0]);
    case 'ceil': return Math.ceil(nums[0]);
    case 'round': return Math.round(nums[0]);
    case 'abs': return Math.abs(nums[0]);
    case 'sin': return Math.sin(nums[0]);
    case 'cos': return Math.cos(nums[0]);
    case 'random': return ctx.random();

    // Comparisons
    case 'eq': return args[0] === args[1];
    case 'neq': return args[0] !== args[1];
    case 'lt': return nums[0] < nums[1];
    case 'lte': return nums[0] <= nums[1];
    case 'gt': return nums[0] > nums[1];
    case 'gte': return nums[0] >= nums[1];

    // Logic
    case 'and': return args.every(a => Boolean(a));
    case 'or': return args.some(a => Boolean(a));
    case 'not': return !Boolean(args[0]);

    // Conditional
    case 'if': return Boolean(args[0]) ? args[1] : (args[2] ?? 0);
    case 'coalesce': return args.find(a => a !== null && a !== undefined && a !== 0) ?? 0;

    default:
      console.warn(`Unknown operation: ${op}`);
      return 0;
  }
}

/**
 * Evaluate a condition to a boolean
 */
export function evaluateCondition(cond: Condition, ctx: EvaluationContext): boolean {
  switch (cond.op) {
    case 'true': return true;
    case 'false': return false;

    case 'flag': {
      const value = getStateValue(ctx.state, cond.flag);
      return Boolean(value);
    }

    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const left = evaluateExpression(cond.left, ctx);
      const right = evaluateExpression(cond.right, ctx);
      const leftNum = typeof left === 'number' ? left : parseFloat(String(left)) || 0;
      const rightNum = typeof right === 'number' ? right : parseFloat(String(right)) || 0;

      switch (cond.op) {
        case 'eq': return left === right;
        case 'neq': return left !== right;
        case 'lt': return leftNum < rightNum;
        case 'lte': return leftNum <= rightNum;
        case 'gt': return leftNum > rightNum;
        case 'gte': return leftNum >= rightNum;
      }
      break;
    }

    case 'and':
      return cond.conditions.every(c => evaluateCondition(c, ctx));

    case 'or':
      return cond.conditions.some(c => evaluateCondition(c, ctx));

    case 'not':
      return !evaluateCondition(cond.condition, ctx);

    case 'between': {
      const value = evaluateExpression(cond.value, ctx);
      const min = evaluateExpression(cond.min, ctx);
      const max = evaluateExpression(cond.max, ctx);
      const valNum = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      const minNum = typeof min === 'number' ? min : parseFloat(String(min)) || 0;
      const maxNum = typeof max === 'number' ? max : parseFloat(String(max)) || 0;
      return valNum >= minNum && valNum <= maxNum;
    }
  }

  return false;
}

/**
 * Format a number for display based on format type
 */
export function formatValue(
  value: number | boolean | string,
  format?: string,
  precision?: number
): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;

  const num = value;

  switch (format) {
    case 'currency':
      return '$' + num.toLocaleString(undefined, {
        minimumFractionDigits: precision ?? 2,
        maximumFractionDigits: precision ?? 2
      });

    case 'percentage':
      return (num * 100).toFixed(precision ?? 0) + '%';

    case 'scientific':
      return num.toExponential(precision ?? 2);

    case 'compact':
      return formatCompact(num);

    case 'time':
      return formatTime(num);

    case 'number':
    default:
      if (precision !== undefined) {
        return num.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        });
      }
      return num.toLocaleString();
  }
}

/**
 * Format large numbers with suffixes (K, M, B, T, etc.)
 */
export function formatCompact(num: number): string {
  const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const tier = Math.floor(Math.log10(Math.abs(num)) / 3);

  if (tier === 0 || !isFinite(tier)) return num.toLocaleString();
  if (tier >= suffixes.length) return num.toExponential(2);

  const scaled = num / Math.pow(10, tier * 3);
  return scaled.toFixed(2) + ' ' + suffixes[tier];
}

/**
 * Format seconds into human-readable time
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  return `${Math.floor(seconds / 86400)} days`;
}
