/**
 * GameAnalyzer - Graph-Based Game Analysis and Testing
 *
 * Treats the game as a directed graph where:
 * - Nodes = distinct game states (combinations of flags and resource thresholds)
 * - Edges = rules and projects that enable transitions between states
 *
 * This enables:
 * - Detecting cycles (feedback loops)
 * - Finding dead ends (states with no escape)
 * - Verifying reachability (can the player reach the end?)
 * - Reverse path testing (start from goal, walk backwards)
 */

import type {
  GameDefinition,
  RuleDefinition,
  ProjectDefinition,
  Condition,
  StateVariableDefinition,
} from '../types/game';

/**
 * Represents a node in the game state graph
 */
export interface StateNode {
  id: string;
  flags: Record<string, boolean>;
  thresholds: Record<string, number>;
  description: string;
}

/**
 * Represents an edge (transition) in the game state graph
 */
export interface StateEdge {
  id: string;
  from: string;
  to: string;
  type: 'rule' | 'project' | 'action';
  sourceId: string;  // Original rule/project ID
  requirements: string[];  // Human-readable requirements
}

/**
 * Represents a cycle in the game graph
 */
export interface GameCycle {
  nodes: string[];
  edges: string[];
  type: 'productive' | 'stagnant' | 'infinite';
  description: string;
}

/**
 * Result of game graph analysis
 */
export interface GraphAnalysis {
  nodes: StateNode[];
  edges: StateEdge[];
  cycles: GameCycle[];
  deadEnds: string[];
  unreachable: string[];
  criticalPath: string[];
  milestones: StateNode[];
}

/**
 * Analyzes a game definition as a graph
 */
export class GameAnalyzer {
  private definition: GameDefinition;

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  /**
   * Extract key milestone states from the game definition
   */
  extractMilestones(): StateNode[] {
    const milestones: StateNode[] = [];
    const flagVars = this.definition.state.filter(v => v.type === 'boolean');

    // Initial state
    milestones.push({
      id: 'initial',
      flags: Object.fromEntries(flagVars.map(v => [v.id, v.initial as boolean])),
      thresholds: {},
      description: 'Game start',
    });

    // Extract states from phases
    if (this.definition.phases) {
      for (const phase of this.definition.phases) {
        milestones.push({
          id: `phase_${phase.id}`,
          flags: {},
          thresholds: this.extractThresholdsFromCondition(phase.trigger),
          description: phase.name,
        });
      }
    }

    // Extract states from project triggers
    for (const project of this.definition.projects) {
      const thresholds = this.extractThresholdsFromCondition(project.trigger);
      const flags = this.extractFlagsFromCondition(project.trigger);

      if (Object.keys(thresholds).length > 0 || Object.keys(flags).length > 0) {
        milestones.push({
          id: `project_${project.id}`,
          flags,
          thresholds,
          description: `Unlock: ${project.name}`,
        });
      }
    }

    // Extract states from rule conditions with maxFires=1 (one-time events)
    for (const rule of this.definition.rules) {
      if (rule.maxFires === 1) {
        const thresholds = this.extractThresholdsFromCondition(rule.condition);
        const flags = this.extractFlagsFromCondition(rule.condition);

        if (Object.keys(thresholds).length > 0 || Object.keys(flags).length > 0) {
          milestones.push({
            id: `rule_${rule.id}`,
            flags,
            thresholds,
            description: rule.name || rule.id,
          });
        }
      }
    }

    return milestones;
  }

  /**
   * Extract threshold requirements from a condition
   */
  private extractThresholdsFromCondition(condition: Condition): Record<string, number> {
    const thresholds: Record<string, number> = {};

    if (condition.op === 'gte' || condition.op === 'gt') {
      const left = condition.left;
      const right = condition.right;

      if (typeof left === 'object' && 'ref' in left && typeof right === 'number') {
        thresholds[left.ref] = right;
      }
    }

    if (condition.op === 'and' || condition.op === 'or') {
      for (const sub of condition.conditions) {
        Object.assign(thresholds, this.extractThresholdsFromCondition(sub));
      }
    }

    return thresholds;
  }

  /**
   * Extract flag requirements from a condition
   */
  private extractFlagsFromCondition(condition: Condition): Record<string, boolean> {
    const flags: Record<string, boolean> = {};

    if (condition.op === 'flag') {
      flags[condition.flag] = true;
    }

    if (condition.op === 'eq') {
      const left = condition.left;
      const right = condition.right;

      if (typeof left === 'object' && 'ref' in left && typeof right === 'boolean') {
        flags[left.ref] = right;
      }
    }

    if (condition.op === 'and' || condition.op === 'or') {
      for (const sub of condition.conditions) {
        Object.assign(flags, this.extractFlagsFromCondition(sub));
      }
    }

    if (condition.op === 'not') {
      const subFlags = this.extractFlagsFromCondition(condition.condition);
      for (const [key, value] of Object.entries(subFlags)) {
        flags[key] = !value;
      }
    }

    return flags;
  }

  /**
   * Build edges from rules and projects
   */
  buildEdges(milestones: StateNode[]): StateEdge[] {
    const edges: StateEdge[] = [];

    // Build edges from rules
    for (const rule of this.definition.rules) {
      const requirements = this.describeCondition(rule.condition);
      const effects = this.analyzeRuleEffects(rule);

      // Find which milestones this rule connects
      for (const from of milestones) {
        for (const to of milestones) {
          if (from.id !== to.id && this.ruleConnects(rule, from, to)) {
            edges.push({
              id: `edge_${rule.id}_${from.id}_${to.id}`,
              from: from.id,
              to: to.id,
              type: 'rule',
              sourceId: rule.id,
              requirements,
            });
          }
        }
      }
    }

    // Build edges from projects
    for (const project of this.definition.projects) {
      const requirements = this.describeCondition(project.trigger);
      const effects = this.analyzeProjectEffects(project);

      for (const from of milestones) {
        for (const to of milestones) {
          if (from.id !== to.id && this.projectConnects(project, from, to)) {
            edges.push({
              id: `edge_${project.id}_${from.id}_${to.id}`,
              from: from.id,
              to: to.id,
              type: 'project',
              sourceId: project.id,
              requirements,
            });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Check if a rule connects two milestone states
   */
  private ruleConnects(rule: RuleDefinition, from: StateNode, to: StateNode): boolean {
    // A rule connects from -> to if:
    // 1. The rule's condition could be met in 'from' state
    // 2. The rule's effects could produce 'to' state

    // Simplified: check if rule sets flags that 'to' requires
    for (const action of rule.actions) {
      if (action.action === 'set' && action.target in to.flags) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a project connects two milestone states
   */
  private projectConnects(project: ProjectDefinition, from: StateNode, to: StateNode): boolean {
    // Similar to ruleConnects
    for (const effect of project.effects) {
      if (effect.action === 'set' && effect.target in to.flags) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze effects of a rule
   */
  private analyzeRuleEffects(rule: RuleDefinition): string[] {
    const effects: string[] = [];

    for (const action of rule.actions) {
      if (action.action === 'set') {
        effects.push(`sets ${action.target}`);
      } else if (action.action === 'add') {
        effects.push(`adds to ${action.target}`);
      } else if (action.action === 'toggle') {
        effects.push(`toggles ${action.target}`);
      }
    }

    return effects;
  }

  /**
   * Analyze effects of a project
   */
  private analyzeProjectEffects(project: ProjectDefinition): string[] {
    const effects: string[] = [];

    for (const effect of project.effects) {
      if (effect.action === 'set') {
        effects.push(`sets ${effect.target}`);
      } else if (effect.action === 'add') {
        effects.push(`adds to ${effect.target}`);
      }
    }

    return effects;
  }

  /**
   * Describe a condition in human-readable form
   */
  private describeCondition(condition: Condition): string[] {
    const descriptions: string[] = [];

    if (condition.op === 'true') {
      descriptions.push('always');
    } else if (condition.op === 'false') {
      descriptions.push('never');
    } else if (condition.op === 'flag') {
      descriptions.push(`${condition.flag} is true`);
    } else if (condition.op === 'gte') {
      const left = this.describeExpression(condition.left);
      const right = this.describeExpression(condition.right);
      descriptions.push(`${left} >= ${right}`);
    } else if (condition.op === 'and') {
      for (const sub of condition.conditions) {
        descriptions.push(...this.describeCondition(sub));
      }
    }

    return descriptions;
  }

  /**
   * Describe an expression in human-readable form
   */
  private describeExpression(expr: unknown): string {
    if (typeof expr === 'number') return expr.toString();
    if (typeof expr === 'string') return expr;
    if (typeof expr === 'object' && expr !== null && 'ref' in expr) {
      return (expr as { ref: string }).ref;
    }
    return '???';
  }

  /**
   * Detect cycles in the game graph using DFS
   */
  detectCycles(edges: StateEdge[]): GameCycle[] {
    const cycles: GameCycle[] = [];
    const graph = this.buildAdjacencyList(edges);
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      for (const neighbor of graph[node] || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycleNodes = path.slice(cycleStart);

          cycles.push({
            nodes: cycleNodes,
            edges: [], // Would need to track edges in path
            type: this.classifyCycle(cycleNodes),
            description: `Cycle: ${cycleNodes.join(' -> ')} -> ${neighbor}`,
          });
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Build adjacency list from edges
   */
  private buildAdjacencyList(edges: StateEdge[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {};

    for (const edge of edges) {
      if (!graph[edge.from]) graph[edge.from] = [];
      graph[edge.from].push(edge.to);
    }

    return graph;
  }

  /**
   * Classify a cycle as productive, stagnant, or infinite
   */
  private classifyCycle(nodes: string[]): 'productive' | 'stagnant' | 'infinite' {
    // Productive: cycle increases resources (e.g., clips -> funds -> upgrades -> more clips)
    // Stagnant: cycle doesn't change anything significant
    // Infinite: cycle could run forever without progressing

    // For now, simplified classification
    if (nodes.some(n => n.includes('production') || n.includes('clipper'))) {
      return 'productive';
    }

    return 'stagnant';
  }

  /**
   * Find dead-end states (no outgoing edges)
   */
  findDeadEnds(milestones: StateNode[], edges: StateEdge[]): string[] {
    const hasOutgoing = new Set(edges.map(e => e.from));
    return milestones
      .map(m => m.id)
      .filter(id => !hasOutgoing.has(id) && !id.includes('final') && !id.includes('end'));
  }

  /**
   * Find unreachable states (no incoming edges except from initial)
   */
  findUnreachable(milestones: StateNode[], edges: StateEdge[]): string[] {
    const reachable = new Set<string>();
    const graph = this.buildAdjacencyList(edges);

    // BFS from initial state
    const queue = ['initial'];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (reachable.has(node)) continue;
      reachable.add(node);

      for (const neighbor of graph[node] || []) {
        if (!reachable.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return milestones
      .map(m => m.id)
      .filter(id => id !== 'initial' && !reachable.has(id));
  }

  /**
   * Find a critical path from initial to final state using BFS
   */
  findCriticalPath(milestones: StateNode[], edges: StateEdge[]): string[] {
    const graph = this.buildAdjacencyList(edges);
    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue = ['initial'];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);

      // Check if this is a final state
      if (node.includes('final') || node.includes('end') || node.includes('space')) {
        // Reconstruct path
        const path: string[] = [node];
        let current = node;
        while (parent.has(current)) {
          current = parent.get(current)!;
          path.unshift(current);
        }
        return path;
      }

      for (const neighbor of graph[node] || []) {
        if (!visited.has(neighbor)) {
          parent.set(neighbor, node);
          queue.push(neighbor);
        }
      }
    }

    return [];
  }

  /**
   * Perform full graph analysis
   */
  analyze(): GraphAnalysis {
    const milestones = this.extractMilestones();
    const edges = this.buildEdges(milestones);
    const cycles = this.detectCycles(edges);
    const deadEnds = this.findDeadEnds(milestones, edges);
    const unreachable = this.findUnreachable(milestones, edges);
    const criticalPath = this.findCriticalPath(milestones, edges);

    return {
      nodes: milestones,
      edges,
      cycles,
      deadEnds,
      unreachable,
      criticalPath,
      milestones,
    };
  }

  /**
   * Generate test cases from the graph
   */
  generateTestCases(): TestCase[] {
    const analysis = this.analyze();
    const testCases: TestCase[] = [];

    // Test: Can reach all milestones from initial
    for (const node of analysis.milestones) {
      if (node.id !== 'initial' && !analysis.unreachable.includes(node.id)) {
        testCases.push({
          name: `Reachability: ${node.description}`,
          type: 'reachability',
          startState: 'initial',
          targetState: node.id,
          expectedResult: true,
        });
      }
    }

    // Test: Dead ends should be final states
    for (const deadEnd of analysis.deadEnds) {
      testCases.push({
        name: `Dead end check: ${deadEnd}`,
        type: 'deadEnd',
        startState: deadEnd,
        targetState: null,
        expectedResult: false, // Dead ends should be intentional final states
      });
    }

    // Test: Productive cycles should not stagnate
    for (const cycle of analysis.cycles) {
      if (cycle.type === 'productive') {
        testCases.push({
          name: `Cycle productivity: ${cycle.description}`,
          type: 'cycle',
          startState: cycle.nodes[0],
          targetState: cycle.nodes[0],
          expectedResult: true,
        });
      }
    }

    // Test: Critical path completion
    if (analysis.criticalPath.length > 0) {
      testCases.push({
        name: 'Critical path: Start to finish',
        type: 'criticalPath',
        startState: analysis.criticalPath[0],
        targetState: analysis.criticalPath[analysis.criticalPath.length - 1],
        expectedResult: true,
      });
    }

    return testCases;
  }
}

/**
 * A generated test case
 */
export interface TestCase {
  name: string;
  type: 'reachability' | 'deadEnd' | 'cycle' | 'criticalPath';
  startState: string;
  targetState: string | null;
  expectedResult: boolean;
}
