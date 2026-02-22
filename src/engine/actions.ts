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
  PendingAction,
  SpawnedEntity,
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
  onEmit?: (event: string, data?: Record<string, unknown>) => void;
  onSpawn?: (entity: SpawnedEntity) => void;
  onAnimate?: (target: string, animation: string, duration?: number, options?: AnimateOptions) => void;
  onSound?: (sound: string, options: SoundOptions) => void;
  onDelay?: (pending: PendingAction) => void;
  functions?: Record<string, Action[]>;
  currentTick?: number;
}

export interface AnimateOptions {
  delay?: number;
  iterations?: number;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface SoundOptions {
  volume?: number;
  loop?: boolean;
  channel?: string;
  fadeIn?: number;
  fadeOut?: number;
}

let pendingActionIdCounter = 0;
let spawnedEntityIdCounter = 0;

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
          icon: action.icon,
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

    case 'delay': {
      const ticks = evaluateExpression(action.ticks, ctx);
      const ticksNum = typeof ticks === 'number' ? Math.floor(ticks) : 1;
      const currentTick = config.currentTick ?? ctx.tick ?? 0;

      const pendingAction: PendingAction = {
        id: `pending_${++pendingActionIdCounter}`,
        executeTick: currentTick + ticksNum,
        actions: action.actions,
      };

      if (config.onDelay) {
        config.onDelay(pendingAction);
      }
      break;
    }

    case 'repeat': {
      const count = evaluateExpression(action.count, ctx);
      const countNum = typeof count === 'number' ? Math.floor(count) : 0;

      for (let i = 0; i < countNum; i++) {
        // Set index variable directly on state if specified
        const prevValue = action.indexVar ? ctx.state[action.indexVar] : undefined;
        const hadPrevValue = action.indexVar ? action.indexVar in ctx.state : false;

        if (action.indexVar) {
          ctx.state[action.indexVar] = i;
        }

        executeAction(action.actions, ctx, config);

        // Restore previous value or delete the index var
        if (action.indexVar) {
          if (hadPrevValue) {
            ctx.state[action.indexVar] = prevValue as number | boolean | string;
          } else {
            delete ctx.state[action.indexVar];
          }
        }
      }
      break;
    }

    case 'random': {
      if (action.choices.length === 0) break;

      // Calculate total weight
      let totalWeight = 0;
      const weights: number[] = [];
      for (const choice of action.choices) {
        const weight = choice.weight
          ? evaluateExpression(choice.weight, ctx)
          : 1;
        const weightNum = typeof weight === 'number' ? Math.max(0, weight) : 1;
        weights.push(weightNum);
        totalWeight += weightNum;
      }

      if (totalWeight <= 0) break;

      // Pick a random choice based on weights
      let roll = ctx.random() * totalWeight;
      for (let i = 0; i < action.choices.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          executeAction(action.choices[i].actions, ctx, config);
          break;
        }
      }
      break;
    }

    case 'loop': {
      const maxIterations = action.maxIterations ?? 1000;
      let iterations = 0;

      while (evaluateCondition(action.while, ctx) && iterations < maxIterations) {
        executeAction(action.actions, ctx, config);
        iterations++;
      }

      if (iterations >= maxIterations) {
        console.warn(`Loop action hit max iterations limit (${maxIterations})`);
      }
      break;
    }

    case 'forEach': {
      const from = evaluateExpression(action.from, ctx);
      const to = evaluateExpression(action.to, ctx);
      const step = action.step ? evaluateExpression(action.step, ctx) : 1;

      const fromNum = typeof from === 'number' ? from : 0;
      const toNum = typeof to === 'number' ? to : 0;
      const stepNum = typeof step === 'number' && step !== 0 ? step : 1;

      // Save previous value of index var
      const prevValue = ctx.state[action.indexVar];
      const hadPrevValue = action.indexVar in ctx.state;

      // Safety limit
      const maxIterations = 10000;
      let iterations = 0;

      if (stepNum > 0) {
        for (let i = fromNum; i < toNum && iterations < maxIterations; i += stepNum) {
          ctx.state[action.indexVar] = i;
          executeAction(action.actions, ctx, config);
          iterations++;
        }
      } else {
        for (let i = fromNum; i > toNum && iterations < maxIterations; i += stepNum) {
          ctx.state[action.indexVar] = i;
          executeAction(action.actions, ctx, config);
          iterations++;
        }
      }

      // Restore previous value or delete the index var
      if (hadPrevValue) {
        ctx.state[action.indexVar] = prevValue;
      } else {
        delete ctx.state[action.indexVar];
      }
      break;
    }

    case 'spawn': {
      const count = action.count ? evaluateExpression(action.count, ctx) : 1;
      const countNum = typeof count === 'number' ? Math.floor(count) : 1;

      for (let i = 0; i < countNum; i++) {
        const properties: Record<string, number | boolean | string> = {};
        if (action.properties) {
          for (const [key, expr] of Object.entries(action.properties)) {
            properties[key] = evaluateExpression(expr, ctx);
          }
        }

        const entity: SpawnedEntity = {
          id: `entity_${++spawnedEntityIdCounter}`,
          type: action.type,
          properties,
          spawnTick: config.currentTick ?? ctx.tick ?? 0,
        };

        if (config.onSpawn) {
          config.onSpawn(entity);
        }
      }
      break;
    }

    case 'emit': {
      const data: Record<string, unknown> = {};
      if (action.data) {
        for (const [key, expr] of Object.entries(action.data)) {
          data[key] = evaluateExpression(expr, ctx);
        }
      }

      if (config.onEmit) {
        config.onEmit(action.event, Object.keys(data).length > 0 ? data : undefined);
      }
      break;
    }

    case 'animate': {
      const duration = action.duration ? evaluateExpression(action.duration, ctx) : undefined;
      const durationNum = typeof duration === 'number' ? duration : undefined;

      const options: AnimateOptions = {};
      if (action.options) {
        if (action.options.delay) {
          const delay = evaluateExpression(action.options.delay, ctx);
          options.delay = typeof delay === 'number' ? delay : undefined;
        }
        if (action.options.iterations) {
          const iterations = evaluateExpression(action.options.iterations, ctx);
          options.iterations = typeof iterations === 'number' ? iterations : undefined;
        }
        if (action.options.direction) {
          options.direction = action.options.direction;
        }
        if (action.options.fill) {
          options.fill = action.options.fill;
        }
      }

      if (config.onAnimate) {
        config.onAnimate(action.target, action.animation, durationNum, options);
      }
      break;
    }

    case 'sound': {
      const volume = action.volume ? evaluateExpression(action.volume, ctx) : 1;
      const fadeIn = action.fadeIn ? evaluateExpression(action.fadeIn, ctx) : undefined;
      const fadeOut = action.fadeOut ? evaluateExpression(action.fadeOut, ctx) : undefined;

      const options: SoundOptions = {
        volume: typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1,
        loop: action.loop,
        channel: action.channel,
        fadeIn: typeof fadeIn === 'number' ? fadeIn : undefined,
        fadeOut: typeof fadeOut === 'number' ? fadeOut : undefined,
      };

      if (config.onSound) {
        config.onSound(action.sound, options);
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
