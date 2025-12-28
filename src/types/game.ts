/**
 * Universal Paperclips - JSON-Driven Game Engine Types
 *
 * This file defines the complete type system for a JSON-based game definition.
 * The goal is to make games fully data-driven and easily editable.
 */

// ============================================================================
// CORE VALUE TYPES
// ============================================================================

/** Expression that can reference game state or be a literal value */
export type Expression =
  | number
  | string
  | boolean
  | { ref: string }  // Reference to a state value, e.g., { ref: "clips" }
  | { op: Operator; args: Expression[] };  // Operation on values

/** Operators for expressions */
export type Operator =
  | 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow'
  | 'min' | 'max' | 'floor' | 'ceil' | 'round' | 'abs'
  | 'sin' | 'cos' | 'random'
  | 'and' | 'or' | 'not'
  | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'if' | 'coalesce';

/** Condition for triggering rules */
export type Condition =
  | { op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; left: Expression; right: Expression }
  | { op: 'and' | 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }
  | { op: 'true' } | { op: 'false' }
  | { op: 'flag'; flag: string }  // Shorthand for checking if a flag is truthy
  | { op: 'between'; value: Expression; min: Expression; max: Expression };

// ============================================================================
// STATE DEFINITIONS
// ============================================================================

/** Definition of a single state variable */
export interface StateVariableDefinition {
  id: string;
  type: 'number' | 'boolean' | 'string';
  initial: number | boolean | string;
  description?: string;
  category?: string;  // For organization: 'resources', 'production', 'flags', etc.
  min?: number;
  max?: number;
  precision?: number;  // Decimal places for display
  persistent?: boolean;  // Whether to save/load this variable
}

/** Definition of game phases/milestones */
export interface PhaseDefinition {
  id: string;
  name: string;
  description?: string;
  trigger: Condition;
  onEnter?: Action[];
  onExit?: Action[];
}

// ============================================================================
// ACTIONS - State Changes
// ============================================================================

/** An action that modifies game state */
export type Action =
  | SetAction
  | AddAction
  | MultiplyAction
  | ToggleAction
  | MessageAction
  | TriggerEventAction
  | ConditionalAction
  | SequenceAction
  | CallAction;

export interface SetAction {
  action: 'set';
  target: string;  // State variable path
  value: Expression;
}

export interface AddAction {
  action: 'add';
  target: string;
  value: Expression;
}

export interface MultiplyAction {
  action: 'multiply';
  target: string;
  value: Expression;
}

export interface ToggleAction {
  action: 'toggle';
  target: string;
}

export interface MessageAction {
  action: 'message';
  text: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export interface TriggerEventAction {
  action: 'trigger';
  event: string;
}

export interface ConditionalAction {
  action: 'if';
  condition: Condition;
  then: Action[];
  else?: Action[];
}

export interface SequenceAction {
  action: 'sequence';
  actions: Action[];
}

export interface CallAction {
  action: 'call';
  function: string;  // Reference to a reusable action sequence
  args?: Record<string, Expression>;
}

// ============================================================================
// RULES - The Heart of the Engine
// ============================================================================

/** When a rule should be evaluated */
export type RuleTiming =
  | 'tick'           // Every game tick
  | 'second'         // Once per second
  | 'action'         // When player takes an action
  | 'stateChange'    // When any state changes
  | 'phaseChange'    // When game phase changes
  | 'init'           // Once at game start
  | 'load';          // When game is loaded

/** A game rule that conditionally performs actions */
export interface RuleDefinition {
  id: string;
  name?: string;
  description?: string;

  timing: RuleTiming | RuleTiming[];
  priority?: number;  // Lower runs first, default 0

  enabled?: Condition;  // Whether rule is active at all
  condition: Condition;  // When to fire the rule

  actions: Action[];

  cooldown?: number;  // Minimum ticks between firings
  maxFires?: number;  // Maximum times this rule can fire

  category?: string;  // For organization
}

// ============================================================================
// PROJECTS / UPGRADES
// ============================================================================

/** Cost definition for a project */
export interface CostDefinition {
  resource: string;  // State variable id
  amount: Expression;
  consumeOnPurchase?: boolean;  // Default true
}

/** A project/upgrade that can be purchased */
export interface ProjectDefinition {
  id: string;
  name: string;
  description: string;
  priceTag?: string;  // Display text for cost

  trigger: Condition;  // When to show this project
  costs: CostDefinition[];

  repeatable?: boolean;
  maxUses?: number;
  cooldown?: number;

  effects: Action[];

  category?: string;
  sortOrder?: number;
}

// ============================================================================
// UI DEFINITIONS
// ============================================================================

/** Definition of a UI element binding */
export interface UIBinding {
  elementId: string;
  type: 'text' | 'display' | 'button' | 'progress' | 'visibility' | 'class' | 'style';

  // For text/display
  value?: Expression;
  format?: 'number' | 'currency' | 'percentage' | 'scientific' | 'compact' | 'time';
  precision?: number;
  prefix?: string;
  suffix?: string;

  // For visibility
  visible?: Condition;

  // For buttons
  onClick?: string;  // Action handler id
  enabled?: Condition;

  // For progress bars
  current?: Expression;
  max?: Expression;

  // For class/style
  class?: string;
  condition?: Condition;  // When to apply class/style
  style?: Record<string, Expression | string>;
}

/** Definition of a UI section */
export interface UISectionDefinition {
  id: string;
  name?: string;
  visible?: Condition;
  bindings: UIBinding[];
}

// ============================================================================
// STRATEGIES / TOURNAMENTS (for this specific game)
// ============================================================================

export interface StrategyDefinition {
  id: string;
  name: string;
  description?: string;
  behavior: 'random' | 'a100' | 'b100' | 'greedy' | 'generous' | 'minimax' | 'titForTat' | 'beatLast' | 'custom';
  customLogic?: string;  // Reference to custom function
  active?: Condition;
}

// ============================================================================
// BATTLE SYSTEM
// ============================================================================

export interface BattleConfig {
  width: number;
  height: number;
  gridWidth: number;
  gridHeight: number;
  maxSpeed: number;
  deathThreshold: number;
  leftColor: string;
  rightColor: string;
  explodeColor: string;
}

// ============================================================================
// FULL GAME DEFINITION
// ============================================================================

/** Complete game definition in JSON */
export interface GameDefinition {
  meta: {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
  };

  config: {
    tickRate: number;  // ms per tick
    autoSaveInterval?: number;  // ticks between autosaves
    maxMessages?: number;  // Console message history
    battle?: BattleConfig;
  };

  state: StateVariableDefinition[];

  phases?: PhaseDefinition[];

  rules: RuleDefinition[];

  projects: ProjectDefinition[];

  strategies?: StrategyDefinition[];

  ui: {
    sections: UISectionDefinition[];
  };

  functions?: Record<string, Action[]>;  // Reusable action sequences

  assets?: {
    css?: string[];
    images?: Record<string, string>;
    audio?: Record<string, string>;
  };
}

// ============================================================================
// RUNTIME STATE
// ============================================================================

/** Runtime game state */
export interface GameState {
  [key: string]: number | boolean | string;
}

/** Runtime context for expression evaluation */
export interface EvaluationContext {
  state: GameState;
  tick: number;
  deltaTime: number;
  random: () => number;
  functions?: Record<string, Action[]>;
}

/** Message for the console */
export interface GameMessage {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

/** Complete runtime state including derived data */
export interface RuntimeState {
  state: GameState;
  tick: number;
  phase: string | null;
  messages: GameMessage[];
  activeProjects: string[];
  completedProjects: Record<string, number>;  // id -> times completed
  ruleFires: Record<string, { count: number; lastTick: number }>;
}
