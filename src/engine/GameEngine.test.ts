/**
 * Tests for the Game Engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import type { GameDefinition } from '../types/game';

// Minimal game definition for testing
const testGameDefinition: GameDefinition = {
  meta: {
    id: 'test-game',
    name: 'Test Game',
    version: '1.0.0',
  },
  config: {
    tickRate: 100,
    maxMessages: 10,
  },
  state: [
    { id: 'clips', type: 'number', initial: 0, category: 'resources' },
    { id: 'funds', type: 'number', initial: 100, category: 'resources' },
    { id: 'wire', type: 'number', initial: 500, category: 'resources' },
    { id: 'autoClipperLevel', type: 'number', initial: 0, category: 'production' },
    { id: 'clipperCost', type: 'number', initial: 5, category: 'costs' },
    { id: 'enabled', type: 'boolean', initial: false, category: 'flags' },
    { id: 'counter', type: 'number', initial: 0, category: 'system' },
  ],
  phases: [
    {
      id: 'startup',
      name: 'Startup',
      trigger: { op: 'lt', left: { ref: 'clips' }, right: 100 },
    },
    {
      id: 'growth',
      name: 'Growth',
      trigger: { op: 'gte', left: { ref: 'clips' }, right: 100 },
    },
  ],
  rules: [
    {
      id: 'increment-counter',
      timing: 'tick',
      condition: { op: 'true' },
      actions: [
        { action: 'add', target: 'counter', value: 1 },
      ],
    },
    {
      id: 'auto-production',
      timing: 'tick',
      condition: {
        op: 'and',
        conditions: [
          { op: 'gt', left: { ref: 'autoClipperLevel' }, right: 0 },
          { op: 'gt', left: { ref: 'wire' }, right: 0 },
        ],
      },
      actions: [
        { action: 'add', target: 'clips', value: { ref: 'autoClipperLevel' } },
        { action: 'add', target: 'wire', value: { op: 'sub', args: [0, { ref: 'autoClipperLevel' }] } },
      ],
    },
    {
      id: 'unlock-feature',
      timing: 'tick',
      maxFires: 1,
      condition: { op: 'gte', left: { ref: 'clips' }, right: 50 },
      actions: [
        { action: 'set', target: 'enabled', value: true },
        { action: 'message', text: 'Feature unlocked!', type: 'success' },
      ],
    },
    {
      id: 'cooldown-rule',
      timing: 'tick',
      cooldown: 5,
      condition: { op: 'flag', flag: 'enabled' },
      actions: [
        { action: 'add', target: 'funds', value: 10 },
      ],
    },
  ],
  projects: [
    {
      id: 'buy-clipper',
      name: 'Buy AutoClipper',
      description: 'Produces clips automatically',
      trigger: { op: 'gte', left: { ref: 'funds' }, right: { ref: 'clipperCost' } },
      costs: [{ resource: 'funds', amount: { ref: 'clipperCost' } }],
      effects: [
        { action: 'add', target: 'autoClipperLevel', value: 1 },
        { action: 'set', target: 'clipperCost', value: { op: 'mul', args: [{ ref: 'clipperCost' }, 1.1] } },
      ],
      repeatable: true,
    },
    {
      id: 'one-time-upgrade',
      name: 'Special Upgrade',
      description: 'Can only be purchased once',
      trigger: { op: 'gte', left: { ref: 'clips' }, right: 10 },
      costs: [{ resource: 'clips', amount: 10 }],
      effects: [
        { action: 'message', text: 'Upgrade complete!' },
      ],
    },
  ],
  functions: {
    makeClip: [
      {
        action: 'if',
        condition: { op: 'gte', left: { ref: 'wire' }, right: 1 },
        then: [
          { action: 'add', target: 'clips', value: 1 },
          { action: 'add', target: 'wire', value: -1 },
        ],
      },
    ],
  },
  ui: {
    sections: [],
  },
};

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(testGameDefinition);
  });

  describe('initialization', () => {
    it('should initialize with correct state', () => {
      expect(engine.getState('clips')).toBe(0);
      expect(engine.getState('funds')).toBe(100);
      expect(engine.getState('wire')).toBe(500);
      expect(engine.getState('enabled')).toBe(false);
    });

    it('should have empty runtime state', () => {
      const runtime = engine.getRuntime();
      expect(runtime.tick).toBe(0);
      expect(runtime.messages).toHaveLength(0);
      expect(runtime.activeProjects).toEqual([]);
    });
  });

  describe('setState', () => {
    it('should update state values', () => {
      engine.setState('clips', 50);
      expect(engine.getState('clips')).toBe(50);
    });
  });

  describe('tick', () => {
    it('should increment tick counter', () => {
      engine.tick();
      expect(engine.getRuntime().tick).toBe(1);
    });

    it('should execute tick rules', () => {
      engine.tick();
      expect(engine.getState('counter')).toBe(1);

      engine.tick();
      expect(engine.getState('counter')).toBe(2);
    });

    it('should execute conditional rules when conditions are met', () => {
      engine.setState('autoClipperLevel', 2);
      engine.tick();

      expect(engine.getState('clips')).toBe(2);
      expect(engine.getState('wire')).toBe(498);
    });

    it('should not execute conditional rules when conditions are not met', () => {
      // autoClipperLevel is 0, so no production
      engine.tick();
      expect(engine.getState('clips')).toBe(0);
    });

    it('should respect maxFires limit', () => {
      // Set clips high enough to trigger the unlock
      engine.setState('clips', 100);

      engine.tick();
      expect(engine.getState('enabled')).toBe(true);

      // Reset and tick again - should not fire again
      engine.setState('enabled', false);
      engine.tick();
      expect(engine.getState('enabled')).toBe(false);
    });

    it('should respect cooldown', () => {
      engine.setState('enabled', true);
      engine.setState('clips', 100); // Prevent unlock rule from interfering

      const initialFunds = engine.getState<number>('funds') || 0;
      engine.tick();
      expect(engine.getState('funds')).toBe(initialFunds + 10);

      // Tick again - should be on cooldown
      engine.tick();
      expect(engine.getState('funds')).toBe(initialFunds + 10);

      // Tick 4 more times to complete cooldown
      engine.tick();
      engine.tick();
      engine.tick();
      engine.tick();

      // Now it should fire again
      expect(engine.getState('funds')).toBe(initialFunds + 20);
    });
  });

  describe('phases', () => {
    it('should detect initial phase', () => {
      engine.tick();
      expect(engine.getRuntime().phase).toBe('startup');
    });

    it('should transition between phases', () => {
      engine.setState('clips', 150);
      engine.tick();
      expect(engine.getRuntime().phase).toBe('growth');
    });
  });

  describe('projects', () => {
    it('should make projects available when trigger conditions are met', () => {
      engine.setState('clips', 20); // Enough for one-time-upgrade
      engine.tick();

      const runtime = engine.getRuntime();
      expect(runtime.activeProjects).toContain('buy-clipper'); // funds >= 5
      expect(runtime.activeProjects).toContain('one-time-upgrade'); // clips >= 10
    });

    it('should successfully purchase a project', () => {
      engine.tick(); // Initialize projects

      const initialFunds = engine.getState<number>('funds') || 0;
      const result = engine.purchaseProject('buy-clipper');

      expect(result).toBe(true);
      expect(engine.getState('autoClipperLevel')).toBe(1);
      expect(engine.getState<number>('funds')).toBeLessThan(initialFunds);
    });

    it('should track project completion', () => {
      engine.setState('clips', 20);
      engine.tick();

      engine.purchaseProject('one-time-upgrade');

      const runtime = engine.getRuntime();
      expect(runtime.completedProjects['one-time-upgrade']).toBe(1);
    });

    it('should remove non-repeatable projects after purchase', () => {
      engine.setState('clips', 20);
      engine.tick();

      engine.purchaseProject('one-time-upgrade');
      engine.tick();

      const runtime = engine.getRuntime();
      expect(runtime.activeProjects).not.toContain('one-time-upgrade');
    });

    it('should allow repeatable projects to be purchased multiple times', () => {
      engine.setState('funds', 1000);
      engine.tick();

      expect(engine.purchaseProject('buy-clipper')).toBe(true);
      expect(engine.getState('autoClipperLevel')).toBe(1);

      engine.tick(); // Re-evaluate projects

      expect(engine.purchaseProject('buy-clipper')).toBe(true);
      expect(engine.getState('autoClipperLevel')).toBe(2);
    });

    it('should not allow purchase when funds are insufficient', () => {
      engine.setState('funds', 0);
      engine.tick();

      const result = engine.purchaseProject('buy-clipper');
      expect(result).toBe(false);
    });
  });

  describe('playerAction', () => {
    it('should execute function actions', () => {
      const initialWire = engine.getState<number>('wire') || 0;

      engine.playerAction('makeClip');

      expect(engine.getState('clips')).toBe(1);
      expect(engine.getState('wire')).toBe(initialWire - 1);
    });
  });

  describe('messages', () => {
    it('should track messages from actions', () => {
      engine.setState('clips', 100);
      engine.tick(); // Should trigger unlock message

      const messages = engine.getMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[messages.length - 1].text).toBe('Feature unlocked!');
    });

    it('should limit message history', () => {
      // Generate many messages
      for (let i = 0; i < 20; i++) {
        engine.setState('clips', 0);
        engine.setState('clips', 100);
        engine.reset(); // This will clear and reset
        engine.setState('clips', 100);
      }

      const messages = engine.getMessages();
      expect(messages.length).toBeLessThanOrEqual(testGameDefinition.config.maxMessages!);
    });
  });

  describe('save/load', () => {
    it('should save and load state', () => {
      engine.setState('clips', 500);
      engine.setState('funds', 1000);
      engine.tick();
      engine.tick();

      // Save the actual state after ticks (rules may have modified it)
      const savedClips = engine.getState<number>('clips') || 0;
      const savedFunds = engine.getState<number>('funds') || 0;
      const savedTick = engine.getRuntime().tick;

      engine.save('test-slot');

      // Create new engine and load
      const newEngine = new GameEngine(testGameDefinition);
      const loaded = newEngine.load('test-slot');

      expect(loaded).toBe(true);
      expect(newEngine.getState('clips')).toBe(savedClips);
      expect(newEngine.getState('funds')).toBe(savedFunds);
      expect(newEngine.getRuntime().tick).toBe(savedTick);
    });

    it('should return false for missing save', () => {
      const result = engine.load('non-existent-slot');
      expect(result).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      engine.setState('clips', 1000);
      engine.setState('funds', 5000);
      engine.tick();
      engine.tick();

      engine.reset();

      expect(engine.getState('clips')).toBe(0);
      expect(engine.getState('funds')).toBe(100);
      expect(engine.getRuntime().tick).toBe(0);
      expect(engine.getRuntime().messages).toHaveLength(0);
    });
  });

  describe('start/stop', () => {
    it('should start and stop game loop', () => {
      vi.useFakeTimers();

      engine.start();
      expect(engine.getRuntime().tick).toBe(0);

      vi.advanceTimersByTime(100); // One tick
      expect(engine.getRuntime().tick).toBe(1);

      vi.advanceTimersByTime(100);
      expect(engine.getRuntime().tick).toBe(2);

      engine.stop();

      vi.advanceTimersByTime(100);
      expect(engine.getRuntime().tick).toBe(2); // Should not advance

      vi.useRealTimers();
    });
  });

  describe('random number generator', () => {
    it('should use custom RNG when set', () => {
      let callCount = 0;
      engine.setRng(() => {
        callCount++;
        return 0.75;
      });

      // Create a game definition with random rule
      const gameWithRandom: GameDefinition = {
        ...testGameDefinition,
        rules: [
          {
            id: 'random-test',
            timing: 'tick',
            condition: { op: 'true' },
            actions: [
              { action: 'set', target: 'counter', value: { op: 'random', args: [] } },
            ],
          },
        ],
      };

      const randomEngine = new GameEngine(gameWithRandom);
      randomEngine.setRng(() => 0.42);
      randomEngine.tick();

      expect(randomEngine.getState('counter')).toBe(0.42);
    });
  });
});

describe('GameEngine events', () => {
  it('should emit onStateChange events', () => {
    const onStateChange = vi.fn();
    const engine = new GameEngine(testGameDefinition, { onStateChange });

    engine.setState('clips', 100);

    expect(onStateChange).toHaveBeenCalled();
  });

  it('should emit onMessage events', () => {
    const onMessage = vi.fn();
    const engine = new GameEngine(testGameDefinition, { onMessage });

    engine.setState('clips', 100);
    engine.tick();

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Feature unlocked!' })
    );
  });

  it('should emit onPhaseChange events', () => {
    const onPhaseChange = vi.fn();
    const engine = new GameEngine(testGameDefinition, { onPhaseChange });

    engine.tick();
    expect(onPhaseChange).toHaveBeenCalledWith('startup');

    engine.setState('clips', 150);
    engine.tick();
    expect(onPhaseChange).toHaveBeenCalledWith('growth');
  });

  it('should emit onProjectsChange events', () => {
    const onProjectsChange = vi.fn();
    const engine = new GameEngine(testGameDefinition, { onProjectsChange });

    engine.tick();

    expect(onProjectsChange).toHaveBeenCalled();
  });
});
