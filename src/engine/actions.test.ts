/**
 * Tests for new action types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAction, ActionExecutorConfig } from './actions';
import type { EvaluationContext, Action, PendingAction, SpawnedEntity } from '../types/game';

describe('Action Executor - New Action Types', () => {
  let ctx: EvaluationContext;
  let config: ActionExecutorConfig;
  let messages: Array<{ text: string; type: string }>;
  let emittedEvents: Array<{ event: string; data?: Record<string, unknown> }>;
  let spawnedEntities: SpawnedEntity[];
  let delayedActions: PendingAction[];
  let animations: Array<{ target: string; animation: string; duration?: number }>;
  let sounds: Array<{ sound: string; volume?: number }>;

  beforeEach(() => {
    ctx = {
      state: { counter: 0, value: 10, flag: false },
      tick: 100,
      deltaTime: 100,
      random: () => 0.5,
    };

    messages = [];
    emittedEvents = [];
    spawnedEntities = [];
    delayedActions = [];
    animations = [];
    sounds = [];

    config = {
      onMessage: (msg) => messages.push({ text: msg.text, type: msg.type }),
      onEmit: (event, data) => emittedEvents.push({ event, data }),
      onSpawn: (entity) => spawnedEntities.push(entity),
      onDelay: (pending) => delayedActions.push(pending),
      onAnimate: (target, animation, duration) => animations.push({ target, animation, duration }),
      onSound: (sound, options) => sounds.push({ sound, volume: options.volume }),
      currentTick: 100,
    };
  });

  describe('repeat action', () => {
    it('should repeat actions the specified number of times', () => {
      const action: Action = {
        action: 'repeat',
        count: 5,
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(5);
    });

    it('should provide index variable when specified', () => {
      const action: Action = {
        action: 'repeat',
        count: 3,
        indexVar: 'i',
        actions: [
          { action: 'add', target: 'counter', value: { ref: 'i' } },
        ],
      };

      executeAction(action, ctx, config);
      // 0 + 1 + 2 = 3
      expect(ctx.state.counter).toBe(3);
    });

    it('should handle zero count', () => {
      const action: Action = {
        action: 'repeat',
        count: 0,
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(0);
    });
  });

  describe('random action', () => {
    it('should execute one of the random choices', () => {
      const action: Action = {
        action: 'random',
        choices: [
          { actions: [{ action: 'set', target: 'counter', value: 1 }] },
          { actions: [{ action: 'set', target: 'counter', value: 2 }] },
          { actions: [{ action: 'set', target: 'counter', value: 3 }] },
        ],
      };

      // With random returning 0.5, should pick middle option
      executeAction(action, ctx, config);
      expect([1, 2, 3]).toContain(ctx.state.counter);
    });

    it('should respect weights', () => {
      // Random returns 0.5, total weight is 10
      // Roll = 0.5 * 10 = 5
      // First choice (weight 1): 5 - 1 = 4 > 0, continue
      // Second choice (weight 8): 4 - 8 = -4 <= 0, pick this one
      ctx.random = () => 0.5;
      const action: Action = {
        action: 'random',
        choices: [
          { weight: 1, actions: [{ action: 'set', target: 'counter', value: 1 }] },
          { weight: 8, actions: [{ action: 'set', target: 'counter', value: 2 }] },
          { weight: 1, actions: [{ action: 'set', target: 'counter', value: 3 }] },
        ],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(2);
    });

    it('should handle empty choices', () => {
      const action: Action = {
        action: 'random',
        choices: [],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(0);
    });
  });

  describe('loop action', () => {
    it('should loop while condition is true', () => {
      const action: Action = {
        action: 'loop',
        while: { op: 'lt', left: { ref: 'counter' }, right: 5 },
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(5);
    });

    it('should respect max iterations limit', () => {
      const action: Action = {
        action: 'loop',
        while: { op: 'true' }, // Infinite loop
        maxIterations: 10,
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      expect(ctx.state.counter).toBe(10);
    });
  });

  describe('forEach action', () => {
    it('should iterate over a range', () => {
      const action: Action = {
        action: 'forEach',
        from: 0,
        to: 5,
        indexVar: 'i',
        actions: [
          { action: 'add', target: 'counter', value: { ref: 'i' } },
        ],
      };

      executeAction(action, ctx, config);
      // 0 + 1 + 2 + 3 + 4 = 10
      expect(ctx.state.counter).toBe(10);
    });

    it('should respect step value', () => {
      const action: Action = {
        action: 'forEach',
        from: 0,
        to: 10,
        step: 2,
        indexVar: 'i',
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      // Iterates: 0, 2, 4, 6, 8 = 5 times
      expect(ctx.state.counter).toBe(5);
    });

    it('should handle negative step', () => {
      const action: Action = {
        action: 'forEach',
        from: 5,
        to: 0,
        step: -1,
        indexVar: 'i',
        actions: [
          { action: 'add', target: 'counter', value: 1 },
        ],
      };

      executeAction(action, ctx, config);
      // Iterates: 5, 4, 3, 2, 1 = 5 times
      expect(ctx.state.counter).toBe(5);
    });
  });

  describe('delay action', () => {
    it('should queue an action for later execution', () => {
      const action: Action = {
        action: 'delay',
        ticks: 10,
        actions: [
          { action: 'set', target: 'counter', value: 42 },
        ],
      };

      executeAction(action, ctx, config);

      expect(delayedActions).toHaveLength(1);
      expect(delayedActions[0].executeTick).toBe(110); // current tick (100) + delay (10)
      expect(delayedActions[0].actions).toHaveLength(1);
    });
  });

  describe('spawn action', () => {
    it('should spawn an entity', () => {
      const action: Action = {
        action: 'spawn',
        type: 'enemy',
        properties: {
          health: 100,
          speed: { ref: 'value' }, // References state.value = 10
        },
      };

      executeAction(action, ctx, config);

      expect(spawnedEntities).toHaveLength(1);
      expect(spawnedEntities[0].type).toBe('enemy');
      expect(spawnedEntities[0].properties.health).toBe(100);
      expect(spawnedEntities[0].properties.speed).toBe(10);
    });

    it('should spawn multiple entities', () => {
      const action: Action = {
        action: 'spawn',
        type: 'particle',
        count: 5,
      };

      executeAction(action, ctx, config);

      expect(spawnedEntities).toHaveLength(5);
      expect(spawnedEntities.every(e => e.type === 'particle')).toBe(true);
    });
  });

  describe('emit action', () => {
    it('should emit a custom event', () => {
      const action: Action = {
        action: 'emit',
        event: 'levelComplete',
        data: {
          score: { ref: 'counter' },
          bonus: 100,
        },
      };

      executeAction(action, ctx, config);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('levelComplete');
      expect(emittedEvents[0].data).toEqual({ score: 0, bonus: 100 });
    });

    it('should emit event without data', () => {
      const action: Action = {
        action: 'emit',
        event: 'gameStart',
      };

      executeAction(action, ctx, config);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('gameStart');
      expect(emittedEvents[0].data).toBeUndefined();
    });
  });

  describe('animate action', () => {
    it('should trigger an animation', () => {
      const action: Action = {
        action: 'animate',
        target: '#player',
        animation: 'bounce',
        duration: 500,
      };

      executeAction(action, ctx, config);

      expect(animations).toHaveLength(1);
      expect(animations[0].target).toBe('#player');
      expect(animations[0].animation).toBe('bounce');
      expect(animations[0].duration).toBe(500);
    });
  });

  describe('sound action', () => {
    it('should play a sound', () => {
      const action: Action = {
        action: 'sound',
        sound: 'click',
        volume: 0.8,
      };

      executeAction(action, ctx, config);

      expect(sounds).toHaveLength(1);
      expect(sounds[0].sound).toBe('click');
      expect(sounds[0].volume).toBe(0.8);
    });

    it('should clamp volume to 0-1 range', () => {
      const action: Action = {
        action: 'sound',
        sound: 'loud',
        volume: 1.5,
      };

      executeAction(action, ctx, config);

      expect(sounds[0].volume).toBe(1);
    });
  });
});

describe('GameEngine - Delayed Actions', () => {
  it('should execute delayed actions at the correct tick', async () => {
    const { GameEngine } = await import('./GameEngine');
    const { GameDefinition } = await import('../types/game');

    const testGame = {
      meta: { id: 'delay-test', name: 'Delay Test', version: '1.0.0' },
      config: { tickRate: 100 },
      state: [
        { id: 'counter', type: 'number' as const, initial: 0 },
        { id: 'delayed', type: 'boolean' as const, initial: false },
      ],
      phases: [],
      rules: [
        {
          id: 'schedule-delay',
          timing: 'tick' as const,
          maxFires: 1,
          condition: { op: 'eq' as const, left: { ref: 'counter' }, right: 0 },
          actions: [
            {
              action: 'delay' as const,
              ticks: 3,
              actions: [{ action: 'set' as const, target: 'delayed', value: true }],
            },
            { action: 'add' as const, target: 'counter', value: 1 },
          ],
        },
      ],
      projects: [],
      ui: { sections: [] },
    };

    const engine = new GameEngine(testGame as any);

    // Tick 1: schedule the delay
    engine.tick();
    expect(engine.getState('delayed')).toBe(false);

    // Tick 2: still waiting
    engine.tick();
    expect(engine.getState('delayed')).toBe(false);

    // Tick 3: still waiting
    engine.tick();
    expect(engine.getState('delayed')).toBe(false);

    // Tick 4: delay should execute (was scheduled at tick 1, delay of 3)
    engine.tick();
    expect(engine.getState('delayed')).toBe(true);
  });
});

describe('GameEngine - Entity Management', () => {
  it('should spawn and track entities', async () => {
    const { GameEngine } = await import('./GameEngine');

    const testGame = {
      meta: { id: 'entity-test', name: 'Entity Test', version: '1.0.0' },
      config: { tickRate: 100 },
      state: [],
      phases: [],
      rules: [
        {
          id: 'spawn-enemies',
          timing: 'init' as const,
          condition: { op: 'true' as const },
          actions: [
            {
              action: 'spawn' as const,
              type: 'enemy',
              count: 3,
              properties: { health: 100 },
            },
          ],
        },
      ],
      projects: [],
      ui: { sections: [] },
    };

    const engine = new GameEngine(testGame as any);
    engine.start();
    engine.stop();

    const entities = engine.getEntities();
    expect(entities).toHaveLength(3);
    expect(entities.every(e => e.type === 'enemy')).toBe(true);
    expect(entities.every(e => e.properties.health === 100)).toBe(true);

    // Test getEntitiesByType
    const enemies = engine.getEntitiesByType('enemy');
    expect(enemies).toHaveLength(3);

    // Test removeEntity
    const firstId = entities[0].id;
    expect(engine.removeEntity(firstId)).toBe(true);
    expect(engine.getEntities()).toHaveLength(2);

    // Test clearEntities
    engine.clearEntities('enemy');
    expect(engine.getEntities()).toHaveLength(0);
  });
});
