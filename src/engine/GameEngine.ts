/**
 * GameEngine - Core Runtime
 *
 * The main game engine that:
 * - Manages game state
 * - Evaluates and fires rules
 * - Handles projects/upgrades
 * - Coordinates UI updates
 */

import type {
  GameDefinition,
  GameState,
  RuntimeState,
  RuleDefinition,
  RuleTiming,
  ProjectDefinition,
  EvaluationContext,
  GameMessage,
  Action,
} from '../types/game';

import { evaluateCondition, getStateValue, setStateValue } from './evaluator';
import { executeAction, applyCosts, canAfford } from './actions';

export interface GameEngineEvents {
  onStateChange?: (state: GameState) => void;
  onMessage?: (message: GameMessage) => void;
  onPhaseChange?: (phase: string | null) => void;
  onProjectsChange?: (available: string[]) => void;
  onTick?: (tick: number) => void;
}

export class GameEngine {
  private definition: GameDefinition;
  private runtime: RuntimeState;
  private events: GameEngineEvents;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = 0;
  private rng: () => number;

  constructor(definition: GameDefinition, events: GameEngineEvents = {}) {
    this.definition = definition;
    this.events = events;
    this.rng = Math.random;

    // Initialize runtime state
    this.runtime = {
      state: this.initializeState(),
      tick: 0,
      phase: null,
      messages: [],
      activeProjects: [],
      completedProjects: {},
      ruleFires: {},
    };
  }

  /**
   * Initialize state from definition
   */
  private initializeState(): GameState {
    const state: GameState = {};

    for (const varDef of this.definition.state) {
      state[varDef.id] = varDef.initial;
    }

    return state;
  }

  /**
   * Get the current evaluation context
   */
  private getContext(): EvaluationContext {
    return {
      state: this.runtime.state,
      tick: this.runtime.tick,
      deltaTime: Date.now() - this.lastTickTime,
      random: this.rng,
      functions: this.definition.functions,
    };
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.tickInterval) return;

    this.lastTickTime = Date.now();

    // Run init rules
    this.fireRulesByTiming('init');

    // Start tick loop
    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.definition.config.tickRate);
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Perform one game tick
   */
  tick(): void {
    const now = Date.now();
    this.lastTickTime = now;
    this.runtime.tick++;

    // Fire tick rules
    this.fireRulesByTiming('tick');

    // Fire second rules every ~1000ms (based on tick rate)
    const ticksPerSecond = 1000 / this.definition.config.tickRate;
    if (this.runtime.tick % Math.round(ticksPerSecond) === 0) {
      this.fireRulesByTiming('second');
    }

    // Check phases
    this.checkPhases();

    // Update available projects
    this.updateAvailableProjects();

    // Autosave check
    if (this.definition.config.autoSaveInterval &&
        this.runtime.tick % this.definition.config.autoSaveInterval === 0) {
      this.save();
    }

    // Emit tick event
    this.events.onTick?.(this.runtime.tick);
  }

  /**
   * Fire rules that match a timing
   */
  private fireRulesByTiming(timing: RuleTiming): void {
    const rules = this.definition.rules.filter(rule => {
      const timings = Array.isArray(rule.timing) ? rule.timing : [rule.timing];
      return timings.includes(timing);
    });

    // Sort by priority
    rules.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const rule of rules) {
      this.tryFireRule(rule);
    }
  }

  /**
   * Try to fire a single rule
   */
  private tryFireRule(rule: RuleDefinition): void {
    const ctx = this.getContext();

    // Check if rule is enabled
    if (rule.enabled && !evaluateCondition(rule.enabled, ctx)) {
      return;
    }

    // Check cooldown
    const ruleState = this.runtime.ruleFires[rule.id];
    if (ruleState && rule.cooldown) {
      if (this.runtime.tick - ruleState.lastTick < rule.cooldown) {
        return;
      }
    }

    // Check max fires
    if (ruleState && rule.maxFires) {
      if (ruleState.count >= rule.maxFires) {
        return;
      }
    }

    // Check condition
    if (!evaluateCondition(rule.condition, ctx)) {
      return;
    }

    // Fire the rule
    this.executeActions(rule.actions);

    // Track firing
    if (!this.runtime.ruleFires[rule.id]) {
      this.runtime.ruleFires[rule.id] = { count: 0, lastTick: 0 };
    }
    this.runtime.ruleFires[rule.id].count++;
    this.runtime.ruleFires[rule.id].lastTick = this.runtime.tick;
  }

  /**
   * Execute actions with proper context
   */
  private executeActions(actions: Action[]): void {
    const ctx = this.getContext();

    executeAction(actions, ctx, {
      onMessage: (msg) => this.addMessage(msg),
      onEvent: (eventId) => this.handleEvent(eventId),
      functions: this.definition.functions,
    });

    // Notify state change
    this.events.onStateChange?.(this.runtime.state);
  }

  /**
   * Add a message to the console
   */
  private addMessage(message: GameMessage): void {
    this.runtime.messages.push(message);

    // Limit message history
    const maxMessages = this.definition.config.maxMessages ?? 100;
    if (this.runtime.messages.length > maxMessages) {
      this.runtime.messages = this.runtime.messages.slice(-maxMessages);
    }

    this.events.onMessage?.(message);
  }

  /**
   * Handle a triggered event
   */
  private handleEvent(eventId: string): void {
    // Fire rules that listen to this event
    // For now, just log it
    console.log('Event triggered:', eventId);
  }

  /**
   * Check and update game phases
   */
  private checkPhases(): void {
    if (!this.definition.phases) return;

    const ctx = this.getContext();
    let newPhase: string | null = null;

    for (const phase of this.definition.phases) {
      if (evaluateCondition(phase.trigger, ctx)) {
        newPhase = phase.id;
        break;
      }
    }

    if (newPhase !== this.runtime.phase) {
      const oldPhase = this.runtime.phase;
      this.runtime.phase = newPhase;

      // Fire exit actions for old phase
      if (oldPhase) {
        const oldPhaseDef = this.definition.phases.find(p => p.id === oldPhase);
        if (oldPhaseDef?.onExit) {
          this.executeActions(oldPhaseDef.onExit);
        }
      }

      // Fire enter actions for new phase
      if (newPhase) {
        const newPhaseDef = this.definition.phases.find(p => p.id === newPhase);
        if (newPhaseDef?.onEnter) {
          this.executeActions(newPhaseDef.onEnter);
        }
      }

      this.events.onPhaseChange?.(newPhase);
    }
  }

  /**
   * Update the list of available projects
   */
  private updateAvailableProjects(): void {
    const ctx = this.getContext();
    const available: string[] = [];

    for (const project of this.definition.projects) {
      // Check if already completed and not repeatable
      const timesCompleted = this.runtime.completedProjects[project.id] || 0;
      if (timesCompleted > 0 && !project.repeatable) {
        continue;
      }
      if (project.maxUses && timesCompleted >= project.maxUses) {
        continue;
      }

      // Check trigger condition
      if (evaluateCondition(project.trigger, ctx)) {
        available.push(project.id);
      }
    }

    // Check if changed
    if (JSON.stringify(available.sort()) !== JSON.stringify(this.runtime.activeProjects.sort())) {
      this.runtime.activeProjects = available;
      this.events.onProjectsChange?.(available);
    }
  }

  /**
   * Attempt to purchase/activate a project
   */
  purchaseProject(projectId: string): boolean {
    const project = this.definition.projects.find(p => p.id === projectId);
    if (!project) {
      console.warn(`Project not found: ${projectId}`);
      return false;
    }

    // Check if available
    if (!this.runtime.activeProjects.includes(projectId)) {
      return false;
    }

    const ctx = this.getContext();

    // Check if can afford
    if (!canAfford(project.costs, ctx)) {
      return false;
    }

    // Apply costs
    applyCosts(project.costs, ctx);

    // Execute effects
    this.executeActions(project.effects);

    // Track completion
    this.runtime.completedProjects[projectId] = (this.runtime.completedProjects[projectId] || 0) + 1;

    // Add completion message
    this.addMessage({
      text: project.name,
      type: 'success',
      timestamp: Date.now(),
    });

    // Update available projects
    this.updateAvailableProjects();

    return true;
  }

  /**
   * Get a project definition by ID
   */
  getProject(projectId: string): ProjectDefinition | undefined {
    return this.definition.projects.find(p => p.id === projectId);
  }

  /**
   * Handle a player action (button click, etc.)
   */
  playerAction(actionId: string): void {
    const fn = this.definition.functions?.[actionId];
    if (fn) {
      this.executeActions(fn);
    }

    // Fire action-timing rules
    this.fireRulesByTiming('action');
  }

  /**
   * Get current state value
   */
  getState<T = number | boolean | string>(path: string): T | undefined {
    return getStateValue(this.runtime.state, path) as T | undefined;
  }

  /**
   * Set state value directly (for cheats, testing, etc.)
   */
  setState(path: string, value: number | boolean | string): void {
    setStateValue(this.runtime.state, path, value);
    this.events.onStateChange?.(this.runtime.state);
  }

  /**
   * Get the full runtime state
   */
  getRuntime(): Readonly<RuntimeState> {
    return this.runtime;
  }

  /**
   * Get the game definition
   */
  getDefinition(): Readonly<GameDefinition> {
    return this.definition;
  }

  /**
   * Get recent messages
   */
  getMessages(count?: number): GameMessage[] {
    if (count) {
      return this.runtime.messages.slice(-count);
    }
    return this.runtime.messages;
  }

  /**
   * Save game state to localStorage
   */
  save(slot: string = 'default'): void {
    const saveData = {
      state: this.runtime.state,
      tick: this.runtime.tick,
      phase: this.runtime.phase,
      completedProjects: this.runtime.completedProjects,
      ruleFires: this.runtime.ruleFires,
      timestamp: Date.now(),
    };

    localStorage.setItem(`game_save_${slot}`, JSON.stringify(saveData));
  }

  /**
   * Load game state from localStorage
   */
  load(slot: string = 'default'): boolean {
    const data = localStorage.getItem(`game_save_${slot}`);
    if (!data) return false;

    try {
      const saveData = JSON.parse(data);

      this.runtime.state = saveData.state;
      this.runtime.tick = saveData.tick;
      this.runtime.phase = saveData.phase;
      this.runtime.completedProjects = saveData.completedProjects || {};
      this.runtime.ruleFires = saveData.ruleFires || {};

      // Fire load rules
      this.fireRulesByTiming('load');

      // Update UI
      this.events.onStateChange?.(this.runtime.state);
      this.updateAvailableProjects();

      return true;
    } catch (e) {
      console.error('Failed to load save:', e);
      return false;
    }
  }

  /**
   * Reset the game to initial state
   */
  reset(): void {
    this.runtime = {
      state: this.initializeState(),
      tick: 0,
      phase: null,
      messages: [],
      activeProjects: [],
      completedProjects: {},
      ruleFires: {},
    };

    this.fireRulesByTiming('init');
    this.events.onStateChange?.(this.runtime.state);
    this.updateAvailableProjects();
  }

  /**
   * Set the random number generator (for testing)
   */
  setRng(rng: () => number): void {
    this.rng = rng;
  }
}
