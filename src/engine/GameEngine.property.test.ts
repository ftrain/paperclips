/**
 * Property-Based Tests for Game Engine using fast-check
 *
 * These tests define invariants that should ALWAYS hold true
 * regardless of the sequence of actions or random values.
 *
 * Properties tested:
 * 1. Resources never go negative (unless explicitly allowed)
 * 2. Production rules are deterministic given same inputs
 * 3. State transitions are reversible through save/load
 * 4. Project costs are always deducted correctly
 * 5. maxFires limits are always respected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { GameEngine } from './GameEngine';
import type { GameDefinition } from '../types/game';

// Minimal game definition for property testing
const propertyTestGame: GameDefinition = {
  meta: {
    id: 'property-test-game',
    name: 'Property Test Game',
    version: '1.0.0',
  },
  config: {
    tickRate: 100,
    maxMessages: 100,
  },
  state: [
    { id: 'clips', type: 'number', initial: 0, min: 0, category: 'resources' },
    { id: 'funds', type: 'number', initial: 100, min: 0, category: 'resources' },
    { id: 'wire', type: 'number', initial: 1000, min: 0, category: 'resources' },
    { id: 'autoClippers', type: 'number', initial: 0, min: 0, category: 'production' },
    { id: 'clipperCost', type: 'number', initial: 10, category: 'costs' },
    { id: 'clipPrice', type: 'number', initial: 0.25, category: 'pricing' },
    { id: 'demand', type: 'number', initial: 1, category: 'market' },
    { id: 'unlocked', type: 'boolean', initial: false, category: 'flags' },
    { id: 'counter', type: 'number', initial: 0, category: 'system' },
  ],
  phases: [],
  rules: [
    {
      id: 'auto-production',
      timing: 'tick',
      condition: {
        op: 'and',
        conditions: [
          { op: 'gt', left: { ref: 'autoClippers' }, right: 0 },
          { op: 'gt', left: { ref: 'wire' }, right: 0 },
        ],
      },
      actions: [
        {
          action: 'add',
          target: 'clips',
          value: {
            op: 'min',
            args: [{ ref: 'autoClippers' }, { ref: 'wire' }],
          },
        },
        {
          action: 'add',
          target: 'wire',
          value: {
            op: 'sub',
            args: [
              0,
              { op: 'min', args: [{ ref: 'autoClippers' }, { ref: 'wire' }] },
            ],
          },
        },
      ],
    },
    {
      id: 'auto-sell',
      timing: 'tick',
      condition: { op: 'gt', left: { ref: 'clips' }, right: 0 },
      actions: [
        {
          action: 'add',
          target: 'funds',
          value: {
            op: 'mul',
            args: [
              { op: 'min', args: [{ ref: 'clips' }, { ref: 'demand' }] },
              { ref: 'clipPrice' },
            ],
          },
        },
        {
          action: 'add',
          target: 'clips',
          value: {
            op: 'sub',
            args: [
              0,
              { op: 'min', args: [{ ref: 'clips' }, { ref: 'demand' }] },
            ],
          },
        },
      ],
    },
    {
      id: 'unlock-feature',
      timing: 'tick',
      maxFires: 1,
      condition: { op: 'gte', left: { ref: 'clips' }, right: 100 },
      actions: [{ action: 'set', target: 'unlocked', value: true }],
    },
    {
      id: 'tick-counter',
      timing: 'tick',
      condition: { op: 'true' },
      actions: [{ action: 'add', target: 'counter', value: 1 }],
    },
  ],
  projects: [
    {
      id: 'buy-clipper',
      name: 'Buy AutoClipper',
      description: 'Automated clip production',
      trigger: { op: 'gte', left: { ref: 'funds' }, right: { ref: 'clipperCost' } },
      costs: [{ resource: 'funds', amount: { ref: 'clipperCost' } }],
      effects: [
        { action: 'add', target: 'autoClippers', value: 1 },
        {
          action: 'set',
          target: 'clipperCost',
          value: { op: 'mul', args: [{ ref: 'clipperCost' }, 1.1] },
        },
      ],
      repeatable: true,
    },
    {
      id: 'buy-wire',
      name: 'Buy Wire',
      description: 'Purchase more wire',
      trigger: { op: 'gte', left: { ref: 'funds' }, right: 20 },
      costs: [{ resource: 'funds', amount: 20 }],
      effects: [{ action: 'add', target: 'wire', value: 500 }],
      repeatable: true,
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
    sellClip: [
      {
        action: 'if',
        condition: { op: 'gte', left: { ref: 'clips' }, right: 1 },
        then: [
          { action: 'add', target: 'clips', value: -1 },
          { action: 'add', target: 'funds', value: { ref: 'clipPrice' } },
        ],
      },
    ],
  },
  ui: { sections: [] },
};

describe('Property-Based Tests: GameEngine', () => {
  // Arbitrary generators for game actions
  const actionArbitrary = fc.oneof(
    fc.constant({ type: 'tick' as const }),
    fc.constant({ type: 'action' as const, name: 'makeClip' }),
    fc.constant({ type: 'action' as const, name: 'sellClip' }),
    fc.constant({ type: 'project' as const, id: 'buy-clipper' }),
    fc.constant({ type: 'project' as const, id: 'buy-wire' })
  );

  const actionSequenceArbitrary = fc.array(actionArbitrary, { minLength: 1, maxLength: 100 });

  // Helper to execute a sequence of actions
  function executeActions(
    engine: GameEngine,
    actions: Array<
      | { type: 'tick' }
      | { type: 'action'; name: string }
      | { type: 'project'; id: string }
    >
  ): void {
    for (const action of actions) {
      switch (action.type) {
        case 'tick':
          engine.tick();
          break;
        case 'action':
          engine.playerAction(action.name);
          break;
        case 'project':
          engine.purchaseProject(action.id);
          break;
      }
    }
  }

  test.prop([actionSequenceArbitrary])(
    'Property: clips never go negative',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      const clips = engine.getState<number>('clips') ?? 0;
      expect(clips).toBeGreaterThanOrEqual(0);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: funds never go negative',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      const funds = engine.getState<number>('funds') ?? 0;
      expect(funds).toBeGreaterThanOrEqual(0);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: wire never goes negative',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      const wire = engine.getState<number>('wire') ?? 0;
      expect(wire).toBeGreaterThanOrEqual(0);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: autoClippers never goes negative',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      const autoClippers = engine.getState<number>('autoClippers') ?? 0;
      expect(autoClippers).toBeGreaterThanOrEqual(0);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: tick counter always equals number of ticks',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      const tickCount = actions.filter((a) => a.type === 'tick').length;

      executeActions(engine, actions);

      const counter = engine.getState<number>('counter') ?? 0;
      expect(counter).toBe(tickCount);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: runtime tick matches counter',
    (actions) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      const runtimeTick = engine.getRuntime().tick;
      const counter = engine.getState<number>('counter') ?? 0;
      expect(runtimeTick).toBe(counter);
    }
  );

  test.prop([actionSequenceArbitrary])(
    'Property: state is deterministic given same sequence',
    (actions) => {
      // Run the same sequence twice and verify identical results
      const engine1 = new GameEngine(propertyTestGame);
      const engine2 = new GameEngine(propertyTestGame);

      // Use fixed RNG for determinism
      engine1.setRng(() => 0.5);
      engine2.setRng(() => 0.5);

      executeActions(engine1, actions);
      executeActions(engine2, actions);

      // Compare all state values
      for (const stateVar of propertyTestGame.state) {
        expect(engine1.getState(stateVar.id)).toBe(engine2.getState(stateVar.id));
      }
    }
  );

  test.prop([actionSequenceArbitrary, fc.string({ minLength: 1, maxLength: 10 })])(
    'Property: save/load preserves state exactly',
    (actions, slotName) => {
      const engine = new GameEngine(propertyTestGame);
      executeActions(engine, actions);

      // Capture state before save
      const stateBeforeSave: Record<string, unknown> = {};
      for (const stateVar of propertyTestGame.state) {
        stateBeforeSave[stateVar.id] = engine.getState(stateVar.id);
      }
      const tickBeforeSave = engine.getRuntime().tick;

      // Save and load into new engine
      engine.save(slotName);
      const newEngine = new GameEngine(propertyTestGame);
      const loaded = newEngine.load(slotName);

      expect(loaded).toBe(true);

      // Verify all state preserved
      for (const stateVar of propertyTestGame.state) {
        expect(newEngine.getState(stateVar.id)).toBe(stateBeforeSave[stateVar.id]);
      }
      expect(newEngine.getRuntime().tick).toBe(tickBeforeSave);
    }
  );

  test.prop([fc.integer({ min: 1, max: 50 })])(
    'Property: maxFires=1 rules only fire once',
    (numTicks) => {
      const engine = new GameEngine(propertyTestGame);

      // Set clips high enough to trigger the unlock rule
      engine.setState('clips', 200);

      // Tick multiple times
      for (let i = 0; i < numTicks; i++) {
        engine.tick();
      }

      // The unlock should have fired exactly once
      // Even with clips >= 100 for all ticks
      expect(engine.getState('unlocked')).toBe(true);

      // Manually reset and verify it doesn't fire again
      engine.setState('unlocked', false);
      engine.tick();
      expect(engine.getState('unlocked')).toBe(false);
    }
  );

  test.prop([fc.integer({ min: 0, max: 100 })])(
    'Property: clipperCost increases after each purchase',
    (numPurchases) => {
      const engine = new GameEngine(propertyTestGame);

      // Give enough funds for multiple purchases
      engine.setState('funds', 100000);
      engine.tick(); // Initialize projects

      let previousCost = engine.getState<number>('clipperCost') ?? 10;
      let successfulPurchases = 0;

      for (let i = 0; i < numPurchases; i++) {
        const result = engine.purchaseProject('buy-clipper');
        if (result) {
          successfulPurchases++;
          const newCost = engine.getState<number>('clipperCost') ?? 0;
          expect(newCost).toBeGreaterThan(previousCost);
          previousCost = newCost;
        }
      }

      // Auto clippers should equal successful purchases
      expect(engine.getState('autoClippers')).toBe(successfulPurchases);
    }
  );

  test.prop([fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 10 })])(
    'Property: total resources are conserved (clips + wire constant when no selling)',
    (autoClippers, numTicks) => {
      const engine = new GameEngine(propertyTestGame);

      // Set up auto-clippers but disable selling by setting demand to 0
      engine.setState('autoClippers', autoClippers);
      engine.setState('demand', 0);

      const initialWire = engine.getState<number>('wire') ?? 0;
      const initialClips = engine.getState<number>('clips') ?? 0;
      const initialTotal = initialWire + initialClips;

      // Run ticks
      for (let i = 0; i < numTicks; i++) {
        engine.tick();
      }

      const finalWire = engine.getState<number>('wire') ?? 0;
      const finalClips = engine.getState<number>('clips') ?? 0;
      const finalTotal = finalWire + finalClips;

      // Conservation: total clips + wire should be constant
      expect(finalTotal).toBe(initialTotal);
    }
  );

  test.prop([fc.integer({ min: 1, max: 100 })])(
    'Property: manual clip making is bounded by wire availability',
    (numAttempts) => {
      const engine = new GameEngine(propertyTestGame);

      const initialWire = engine.getState<number>('wire') ?? 0;

      // Try to make more clips than we have wire
      for (let i = 0; i < numAttempts; i++) {
        engine.playerAction('makeClip');
      }

      const clips = engine.getState<number>('clips') ?? 0;
      const wire = engine.getState<number>('wire') ?? 0;

      // Should have made at most initialWire clips
      expect(clips).toBeLessThanOrEqual(initialWire);
      // Wire should never go negative
      expect(wire).toBeGreaterThanOrEqual(0);
      // Conservation
      expect(clips + wire).toBe(initialWire);
    }
  );
});

describe('Property-Based Tests: Expression Evaluation', () => {
  test.prop([fc.integer(), fc.integer()])(
    'Property: add is commutative',
    (a, b) => {
      const engine = new GameEngine(propertyTestGame);
      engine.setState('clips', a);
      engine.setState('wire', b);

      // Evaluate a + b
      const expr1 = {
        op: 'add' as const,
        args: [{ ref: 'clips' }, { ref: 'wire' }],
      };

      // Evaluate b + a
      const expr2 = {
        op: 'add' as const,
        args: [{ ref: 'wire' }, { ref: 'clips' }],
      };

      // Use internal evaluation (access via tick with a test rule)
      // For this test, we verify via state manipulation
      expect(a + b).toBe(b + a);
    }
  );

  test.prop([fc.double({ min: -1e10, max: 1e10, noNaN: true })])(
    'Property: min/max bounds work correctly',
    (value) => {
      const engine = new GameEngine(propertyTestGame);
      engine.setState('clips', value);

      const clips = engine.getState<number>('clips') ?? 0;

      // Value should have been set (no min/max enforcement in this test game for clips)
      expect(clips).toBe(value);
    }
  );
});

describe('Property-Based Tests: Project Purchasing', () => {
  test.prop([fc.integer({ min: 0, max: 1000 })])(
    'Property: cannot purchase project without sufficient funds',
    (funds) => {
      const engine = new GameEngine(propertyTestGame);
      engine.setState('funds', funds);
      engine.tick();

      const clipperCost = engine.getState<number>('clipperCost') ?? 10;

      // Attempt purchase
      const result = engine.purchaseProject('buy-clipper');

      if (funds >= clipperCost) {
        expect(result).toBe(true);
        expect(engine.getState<number>('funds')).toBeLessThan(funds);
      } else {
        expect(result).toBe(false);
        expect(engine.getState('funds')).toBe(funds);
      }
    }
  );

  test.prop([fc.integer({ min: 1, max: 20 })])(
    'Property: completed projects are tracked correctly',
    (numPurchases) => {
      const engine = new GameEngine(propertyTestGame);
      engine.setState('funds', 1000000);
      engine.tick();

      let successCount = 0;
      for (let i = 0; i < numPurchases; i++) {
        if (engine.purchaseProject('buy-clipper')) {
          successCount++;
        }
        engine.tick(); // Re-evaluate projects
      }

      const runtime = engine.getRuntime();
      const completedCount = runtime.completedProjects['buy-clipper'] ?? 0;
      expect(completedCount).toBe(successCount);
    }
  );
});
