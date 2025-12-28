/**
 * Zod Schemas for Game Definition Validation
 *
 * These schemas:
 * 1. Validate game.json at runtime
 * 2. Infer TypeScript types automatically
 * 3. Provide detailed error messages for invalid configs
 */

import { z } from 'zod';

// ============================================================================
// EXPRESSION SCHEMAS
// ============================================================================

/** Base expression types */
const LiteralExpressionSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
]);

/** Reference to a state value */
const RefExpressionSchema = z.object({
  ref: z.string(),
});

/** Operators for expressions */
const OperatorSchema = z.enum([
  'add', 'sub', 'mul', 'div', 'mod', 'pow',
  'min', 'max', 'floor', 'ceil', 'round', 'abs',
  'sin', 'cos', 'random',
  'and', 'or', 'not',
  'eq', 'neq', 'lt', 'lte', 'gt', 'gte',
  'if', 'coalesce',
]);

/** Recursive expression schema */
const ExpressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    LiteralExpressionSchema,
    RefExpressionSchema,
    z.object({
      op: OperatorSchema,
      args: z.array(ExpressionSchema),
    }),
  ])
);

// Type inference from schema
type Expression = z.infer<typeof LiteralExpressionSchema> | { ref: string } | { op: string; args: Expression[] };

// ============================================================================
// CONDITION SCHEMAS
// ============================================================================

/** Base condition schema (recursive) */
const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('true') }),
    z.object({ op: z.literal('false') }),
    z.object({ op: z.literal('flag'), flag: z.string() }),
    z.object({
      op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']),
      left: ExpressionSchema,
      right: ExpressionSchema,
    }),
    z.object({
      op: z.enum(['and', 'or']),
      conditions: z.array(ConditionSchema),
    }),
    z.object({
      op: z.literal('not'),
      condition: ConditionSchema,
    }),
    z.object({
      op: z.literal('between'),
      value: ExpressionSchema,
      min: ExpressionSchema,
      max: ExpressionSchema,
    }),
  ])
);

type Condition =
  | { op: 'true' }
  | { op: 'false' }
  | { op: 'flag'; flag: string }
  | { op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; left: Expression; right: Expression }
  | { op: 'and' | 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }
  | { op: 'between'; value: Expression; min: Expression; max: Expression };

// ============================================================================
// ACTION SCHEMAS
// ============================================================================

const SetActionSchema = z.object({
  action: z.literal('set'),
  target: z.string(),
  value: ExpressionSchema,
});

const AddActionSchema = z.object({
  action: z.literal('add'),
  target: z.string(),
  value: ExpressionSchema,
});

const MultiplyActionSchema = z.object({
  action: z.literal('multiply'),
  target: z.string(),
  value: ExpressionSchema,
});

const ToggleActionSchema = z.object({
  action: z.literal('toggle'),
  target: z.string(),
});

const MessageActionSchema = z.object({
  action: z.literal('message'),
  text: z.string(),
  type: z.enum(['info', 'success', 'warning', 'error']).optional(),
  icon: z.string().optional(),
});

const TriggerActionSchema = z.object({
  action: z.literal('trigger'),
  event: z.string(),
});

const DelayActionSchema = z.object({
  action: z.literal('delay'),
  ticks: ExpressionSchema,
  actions: z.lazy(() => z.array(ActionSchema)),
});

const RepeatActionSchema = z.object({
  action: z.literal('repeat'),
  count: ExpressionSchema,
  actions: z.lazy(() => z.array(ActionSchema)),
  indexVar: z.string().optional(),
});

const RandomChoiceSchema = z.object({
  weight: ExpressionSchema.optional(),
  actions: z.lazy(() => z.array(ActionSchema)),
});

const RandomActionSchema = z.object({
  action: z.literal('random'),
  choices: z.array(RandomChoiceSchema),
});

const LoopActionSchema = z.object({
  action: z.literal('loop'),
  while: ConditionSchema,
  actions: z.lazy(() => z.array(ActionSchema)),
  maxIterations: z.number().int().positive().optional(),
});

const ForEachActionSchema = z.object({
  action: z.literal('forEach'),
  from: ExpressionSchema,
  to: ExpressionSchema,
  step: ExpressionSchema.optional(),
  indexVar: z.string(),
  actions: z.lazy(() => z.array(ActionSchema)),
});

const SpawnActionSchema = z.object({
  action: z.literal('spawn'),
  type: z.string(),
  count: ExpressionSchema.optional(),
  properties: z.record(z.string(), ExpressionSchema).optional(),
});

const EmitActionSchema = z.object({
  action: z.literal('emit'),
  event: z.string(),
  data: z.record(z.string(), ExpressionSchema).optional(),
});

const AnimateActionSchema = z.object({
  action: z.literal('animate'),
  target: z.string(),
  animation: z.string(),
  duration: ExpressionSchema.optional(),
  options: z.object({
    delay: ExpressionSchema.optional(),
    iterations: ExpressionSchema.optional(),
    direction: z.enum(['normal', 'reverse', 'alternate', 'alternate-reverse']).optional(),
    fill: z.enum(['none', 'forwards', 'backwards', 'both']).optional(),
  }).optional(),
});

const SoundActionSchema = z.object({
  action: z.literal('sound'),
  sound: z.string(),
  volume: ExpressionSchema.optional(),
  loop: z.boolean().optional(),
  channel: z.string().optional(),
  fadeIn: ExpressionSchema.optional(),
  fadeOut: ExpressionSchema.optional(),
});

const ActionSchema: z.ZodType<Action> = z.lazy(() =>
  z.union([
    SetActionSchema,
    AddActionSchema,
    MultiplyActionSchema,
    ToggleActionSchema,
    MessageActionSchema,
    TriggerActionSchema,
    DelayActionSchema,
    RepeatActionSchema,
    RandomActionSchema,
    LoopActionSchema,
    ForEachActionSchema,
    SpawnActionSchema,
    EmitActionSchema,
    AnimateActionSchema,
    SoundActionSchema,
    z.object({
      action: z.literal('if'),
      condition: ConditionSchema,
      then: z.array(ActionSchema),
      else: z.array(ActionSchema).optional(),
    }),
    z.object({
      action: z.literal('sequence'),
      actions: z.array(ActionSchema),
    }),
    z.object({
      action: z.literal('call'),
      function: z.string(),
      args: z.record(z.string(), ExpressionSchema).optional(),
    }),
  ])
);

type Action = z.infer<typeof SetActionSchema>
  | z.infer<typeof AddActionSchema>
  | z.infer<typeof MultiplyActionSchema>
  | z.infer<typeof ToggleActionSchema>
  | z.infer<typeof MessageActionSchema>
  | z.infer<typeof TriggerActionSchema>
  | z.infer<typeof DelayActionSchema>
  | z.infer<typeof RepeatActionSchema>
  | z.infer<typeof RandomActionSchema>
  | z.infer<typeof LoopActionSchema>
  | z.infer<typeof ForEachActionSchema>
  | z.infer<typeof SpawnActionSchema>
  | z.infer<typeof EmitActionSchema>
  | z.infer<typeof AnimateActionSchema>
  | z.infer<typeof SoundActionSchema>
  | { action: 'if'; condition: Condition; then: Action[]; else?: Action[] }
  | { action: 'sequence'; actions: Action[] }
  | { action: 'call'; function: string; args?: Record<string, Expression> };

// ============================================================================
// STATE VARIABLE SCHEMA
// ============================================================================

export const StateVariableSchema = z.object({
  id: z.string().min(1, 'State variable must have an id'),
  type: z.enum(['number', 'boolean', 'string']),
  initial: z.union([z.number(), z.boolean(), z.string()]),
  description: z.string().optional(),
  category: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  precision: z.number().int().min(0).optional(),
  persistent: z.boolean().optional(),
}).refine(
  (data) => {
    // Validate that initial value matches declared type
    if (data.type === 'number') return typeof data.initial === 'number';
    if (data.type === 'boolean') return typeof data.initial === 'boolean';
    if (data.type === 'string') return typeof data.initial === 'string';
    return true;
  },
  { message: 'Initial value must match declared type' }
);

// ============================================================================
// PHASE SCHEMA
// ============================================================================

export const PhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  trigger: ConditionSchema,
  onEnter: z.array(ActionSchema).optional(),
  onExit: z.array(ActionSchema).optional(),
});

// ============================================================================
// RULE SCHEMA
// ============================================================================

export const RuleTimingSchema = z.enum([
  'tick', 'second', 'action', 'stateChange', 'phaseChange', 'init', 'load'
]);

export const RuleSchema = z.object({
  id: z.string().min(1, 'Rule must have an id'),
  name: z.string().optional(),
  description: z.string().optional(),
  timing: z.union([RuleTimingSchema, z.array(RuleTimingSchema)]),
  priority: z.number().int().optional(),
  enabled: ConditionSchema.optional(),
  condition: ConditionSchema,
  actions: z.array(ActionSchema).min(1, 'Rule must have at least one action'),
  cooldown: z.number().int().positive().optional(),
  maxFires: z.number().int().positive().optional(),
  category: z.string().optional(),
});

// ============================================================================
// PROJECT SCHEMA
// ============================================================================

export const CostSchema = z.object({
  resource: z.string(),
  amount: ExpressionSchema,
  consumeOnPurchase: z.boolean().optional(),
});

export const ProjectSchema = z.object({
  id: z.string().min(1, 'Project must have an id'),
  name: z.string().min(1, 'Project must have a name'),
  description: z.string(),
  priceTag: z.string().optional(),
  icon: z.string().optional(),
  trigger: ConditionSchema,
  costs: z.array(CostSchema),
  repeatable: z.boolean().optional(),
  maxUses: z.number().int().positive().optional(),
  cooldown: z.number().int().positive().optional(),
  effects: z.array(ActionSchema).min(1, 'Project must have at least one effect'),
  category: z.string().optional(),
  sortOrder: z.number().optional(),
});

// ============================================================================
// UI BINDING SCHEMAS
// ============================================================================

export const UIBindingSchema = z.object({
  elementId: z.string(),
  type: z.enum(['text', 'display', 'button', 'progress', 'visibility', 'class', 'style', 'icon']),
  value: ExpressionSchema.optional(),
  format: z.enum(['number', 'currency', 'percentage', 'scientific', 'compact', 'time']).optional(),
  precision: z.number().int().min(0).optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  visible: ConditionSchema.optional(),
  onClick: z.string().optional(),
  enabled: ConditionSchema.optional(),
  icon: z.string().optional(),
  current: ExpressionSchema.optional(),
  max: ExpressionSchema.optional(),
  class: z.string().optional(),
  condition: ConditionSchema.optional(),
  style: z.record(z.string(), z.union([ExpressionSchema, z.string()])).optional(),
  iconValue: ExpressionSchema.optional(),
  iconMap: z.record(z.string(), z.string()).optional(),
});

export const UISectionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  visible: ConditionSchema.optional(),
  bindings: z.array(UIBindingSchema),
});

// ============================================================================
// BATTLE CONFIG SCHEMA
// ============================================================================

export const BattleConfigSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  gridWidth: z.number().int().positive(),
  gridHeight: z.number().int().positive(),
  maxSpeed: z.number().positive(),
  deathThreshold: z.number().min(0).max(1),
  leftColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color'),
  rightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color'),
  explodeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be hex color'),
});

// ============================================================================
// ICON DEFINITION SCHEMA
// ============================================================================

export const IconDefinitionSchema = z.object({
  type: z.enum(['svg', 'image', 'emoji', 'fonticon']),
  value: z.string(),
  color: z.string().optional(),
  size: z.number().positive().optional(),
});

// ============================================================================
// FULL GAME DEFINITION SCHEMA
// ============================================================================

export const GameDefinitionSchema = z.object({
  meta: z.object({
    id: z.string().min(1, 'Game must have an id'),
    name: z.string().min(1, 'Game must have a name'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
    description: z.string().optional(),
    author: z.string().optional(),
  }),

  config: z.object({
    tickRate: z.number().int().positive().min(1).max(1000),
    autoSaveInterval: z.number().int().positive().optional(),
    maxMessages: z.number().int().positive().optional(),
    battle: BattleConfigSchema.optional(),
  }),

  state: z.array(StateVariableSchema)
    .min(1, 'Game must have at least one state variable')
    .refine(
      (vars) => {
        const ids = vars.map(v => v.id);
        return new Set(ids).size === ids.length;
      },
      { message: 'State variable ids must be unique' }
    ),

  phases: z.array(PhaseSchema).optional(),

  rules: z.array(RuleSchema)
    .refine(
      (rules) => {
        const ids = rules.map(r => r.id);
        return new Set(ids).size === ids.length;
      },
      { message: 'Rule ids must be unique' }
    ),

  projects: z.array(ProjectSchema)
    .refine(
      (projects) => {
        const ids = projects.map(p => p.id);
        return new Set(ids).size === ids.length;
      },
      { message: 'Project ids must be unique' }
    ),

  functions: z.record(z.string(), z.array(ActionSchema)).optional(),

  ui: z.object({
    sections: z.array(UISectionSchema),
  }),

  assets: z.object({
    css: z.array(z.string()).optional(),
    images: z.record(z.string(), z.string()).optional(),
    icons: z.record(z.string(), IconDefinitionSchema).optional(),
    audio: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type ValidatedGameDefinition = z.infer<typeof GameDefinitionSchema>;
export type ValidatedStateVariable = z.infer<typeof StateVariableSchema>;
export type ValidatedRule = z.infer<typeof RuleSchema>;
export type ValidatedProject = z.infer<typeof ProjectSchema>;
export type ValidatedPhase = z.infer<typeof PhaseSchema>;
export type ValidatedUIBinding = z.infer<typeof UIBindingSchema>;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  success: boolean;
  data?: ValidatedGameDefinition;
  errors?: z.ZodError;
}

/**
 * Validate a game definition object
 */
export function validateGameDefinition(data: unknown): ValidationResult {
  const result = GameDefinitionSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Validate and throw on error
 */
export function parseGameDefinition(data: unknown): ValidatedGameDefinition {
  return GameDefinitionSchema.parse(data);
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: z.ZodError): string[] {
  if (!errors || !errors.errors) {
    return ['Unknown validation error'];
  }
  return errors.errors.map(err => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
}

/**
 * Validate state variable references in conditions and expressions
 */
export function validateStateReferences(
  definition: ValidatedGameDefinition
): string[] {
  const stateIds = new Set(definition.state.map(s => s.id));
  const errors: string[] = [];

  // Helper to check expression references
  const checkExpression = (expr: unknown, context: string): void => {
    if (expr && typeof expr === 'object' && 'ref' in expr) {
      const ref = (expr as { ref: string }).ref;
      // Allow _args references for function parameters
      if (!stateIds.has(ref) && !ref.startsWith('_')) {
        errors.push(`${context}: Unknown state reference "${ref}"`);
      }
    }
    if (expr && typeof expr === 'object' && 'args' in expr) {
      const args = (expr as { args: unknown[] }).args;
      args.forEach((arg, i) => checkExpression(arg, `${context}.args[${i}]`));
    }
  };

  // Check rules
  definition.rules.forEach((rule, i) => {
    rule.actions.forEach((action, j) => {
      if ('value' in action) {
        checkExpression(action.value, `rules[${i}].actions[${j}].value`);
      }
    });
  });

  return errors;
}
