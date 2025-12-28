/**
 * Action Executor
 *
 * Executes actions that modify game state.
 */

import type {
  Action,
  EvaluationContext,
  GameState,
  GameMessage,
  RuntimeState,
} from '../types/game';

import {
  evaluateExpression,
  evaluateCondition,
  getStateValue,
  setStateValue,
} from './evaluator';

export interface ActionExecutorConfig {
  onMessage?: (message: GameMessage) => void;
  onEvent?: (eventId: string) => void;
  functions?: Record<string, Action[]>;
}

/**
 * Execute a single action or array of actions
 */
export function executeAction(
  action: Action | Action[],
  ctx: EvaluationContext,
  config: ActionExecutorConfig = {}
): void {
  if (Array.isArray(action)) {
    for (const a of action) {
      executeAction(a, ctx, config);
    }
    return;
  }

  switch (action.action) {
    case 'set': {
      const value = evaluateExpression(action.value, ctx);
      setStateValue(ctx.state, action.target, value);
      break;
    }

    case 'add': {
      const current = getStateValue(ctx.state, action.target);
      const addValue = evaluateExpression(action.value, ctx);
      const currentNum = typeof current === 'number' ? current : 0;
      const addNum = typeof addValue === 'number' ? addValue : parseFloat(String(addValue)) || 0;
      setStateValue(ctx.state, action.target, currentNum + addNum);
      break;
    }

    case 'multiply': {
      const current = getStateValue(ctx.state, action.target);
      const mulValue = evaluateExpression(action.value, ctx);
      const currentNum = typeof current === 'number' ? current : 0;
      const mulNum = typeof mulValue === 'number' ? mulValue : parseFloat(String(mulValue)) || 0;
      setStateValue(ctx.state, action.target, currentNum * mulNum);
      break;
    }

    case 'toggle': {
      const current = getStateValue(ctx.state, action.target);
      setStateValue(ctx.state, action.target, !current);
      break;
    }

    case 'message': {
      if (config.onMessage) {
        config.onMessage({
          text: action.text,
          type: action.type || 'info',
          timestamp: Date.now(),
        });
      }
      break;
    }

    case 'trigger': {
      if (config.onEvent) {
        config.onEvent(action.event);
      }
      break;
    }

    case 'if': {
      if (evaluateCondition(action.condition, ctx)) {
        executeAction(action.then, ctx, config);
      } else if (action.else) {
        executeAction(action.else, ctx, config);
      }
      break;
    }

    case 'sequence': {
      executeAction(action.actions, ctx, config);
      break;
    }

    case 'call': {
      const fn = config.functions?.[action.function] || ctx.functions?.[action.function];
      if (fn) {
        // Create a new context with args if provided
        let fnCtx = ctx;
        if (action.args) {
          const evaledArgs: Record<string, number | boolean | string> = {};
          for (const [key, expr] of Object.entries(action.args)) {
            evaledArgs[key] = evaluateExpression(expr, ctx);
          }
          fnCtx = {
            ...ctx,
            state: { ...ctx.state, _args: evaledArgs } as GameState,
          };
        }
        executeAction(fn, fnCtx, config);
      } else {
        console.warn(`Function not found: ${action.function}`);
      }
      break;
    }

    default:
      console.warn('Unknown action type:', (action as Action).action);
  }
}

/**
 * Apply cost deductions for a project/purchase
 */
export function applyCosts(
  costs: { resource: string; amount: number | { ref: string } | { op: string; args: unknown[] }; consumeOnPurchase?: boolean }[],
  ctx: EvaluationContext
): boolean {
  // First check if all costs can be paid
  for (const cost of costs) {
    const amount = evaluateExpression(cost.amount as import('../types/game').Expression, ctx);
    const current = getStateValue(ctx.state, cost.resource);
    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
    const currentNum = typeof current === 'number' ? current : 0;

    if (currentNum < amountNum) {
      return false;
    }
  }

  // All costs can be paid, now deduct them
  for (const cost of costs) {
    if (cost.consumeOnPurchase === false) continue;

    const amount = evaluateExpression(cost.amount as import('../types/game').Expression, ctx);
    const current = getStateValue(ctx.state, cost.resource);
    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
    const currentNum = typeof current === 'number' ? current : 0;

    setStateValue(ctx.state, cost.resource, currentNum - amountNum);
  }

  return true;
}

/**
 * Check if costs can be afforded
 */
export function canAfford(
  costs: { resource: string; amount: number | { ref: string } | { op: string; args: unknown[] } }[],
  ctx: EvaluationContext
): boolean {
  for (const cost of costs) {
    const amount = evaluateExpression(cost.amount as import('../types/game').Expression, ctx);
    const current = getStateValue(ctx.state, cost.resource);
    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
    const currentNum = typeof current === 'number' ? current : 0;

    if (currentNum < amountNum) {
      return false;
    }
  }
  return true;
}
