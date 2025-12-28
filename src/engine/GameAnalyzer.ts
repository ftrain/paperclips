/**
 * GameAnalyzer - Graph-Based Game Analysis and Testing
 *
 * Uses @dagrejs/graphlib for robust graph algorithms.
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
 * - Topological sorting for dependency analysis
 */

import { Graph, alg } from '@dagrejs/graphlib';
import type {
  GameDefinition,
  RuleDefinition,
  ProjectDefinition,
  Condition,
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
  isAcyclic: boolean;
  components: string[][];
  topologicalOrder: string[] | null;
}

/**
 * Analyzes a game definition as a graph using graphlib
 */
export class GameAnalyzer {
  private definition: GameDefinition;
  private graph: Graph;

  constructor(definition: GameDefinition) {
    this.definition = definition;
    this.graph = new Graph({ directed: true, multigraph: true });
  }

  /**
   * Build the graphlib graph from milestones and edges
   */
  private buildGraph(milestones: StateNode[], edges: StateEdge[]): void {
    this.graph = new Graph({ directed: true, multigraph: true });

    // Add nodes
    for (const milestone of milestones) {
      this.graph.setNode(milestone.id, milestone);
    }

    // Add edges
    for (const edge of edges) {
      this.graph.setEdge(edge.from, edge.to, edge, edge.id);
    }
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
    for (const effect of project.effects) {
      if (effect.action === 'set' && effect.target in to.flags) {
        return true;
      }
    }
    return false;
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
   * Detect cycles using graphlib's findCycles algorithm
   */
  detectCycles(edges: StateEdge[]): GameCycle[] {
    const milestones = this.extractMilestones();
    this.buildGraph(milestones, edges);

    // Use graphlib's cycle detection
    const rawCycles = alg.findCycles(this.graph);

    return rawCycles.map((cycleNodes, index) => ({
      nodes: cycleNodes,
      edges: this.findEdgesInCycle(cycleNodes, edges),
      type: this.classifyCycle(cycleNodes),
      description: `Cycle ${index + 1}: ${cycleNodes.join(' -> ')} -> ${cycleNodes[0]}`,
    }));
  }

  /**
   * Find edges that form a cycle
   */
  private findEdgesInCycle(cycleNodes: string[], edges: StateEdge[]): string[] {
    const cycleEdges: string[] = [];
    const nodeSet = new Set(cycleNodes);

    for (const edge of edges) {
      if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) {
        cycleEdges.push(edge.id);
      }
    }

    return cycleEdges;
  }

  /**
   * Classify a cycle as productive, stagnant, or infinite
   */
  private classifyCycle(nodes: string[]): 'productive' | 'stagnant' | 'infinite' {
    // Productive: cycle involves production or clippers (core game loop)
    if (nodes.some(n => n.includes('production') || n.includes('clipper') || n.includes('auto'))) {
      return 'productive';
    }

    // Check if it's a main game flow cycle
    if (nodes.some(n => n.includes('initial') || n.includes('unlock'))) {
      return 'productive';
    }

    return 'stagnant';
  }

  /**
   * Find dead-end states using graphlib
   */
  findDeadEnds(milestones: StateNode[], edges: StateEdge[]): string[] {
    this.buildGraph(milestones, edges);

    return milestones
      .map(m => m.id)
      .filter(id => {
        const successors = this.graph.successors(id);
        const hasNoOutgoing = !successors || successors.length === 0;
        const isNotFinal = !id.includes('final') && !id.includes('end');
        return hasNoOutgoing && isNotFinal;
      });
  }

  /**
   * Find unreachable states using graphlib's preorder DFS
   */
  findUnreachable(milestones: StateNode[], edges: StateEdge[]): string[] {
    this.buildGraph(milestones, edges);

    // Get all nodes reachable from 'initial' using preorder traversal
    const reachable = new Set<string>();

    if (this.graph.hasNode('initial')) {
      const preorderNodes = alg.preorder(this.graph, ['initial']);
      for (const node of preorderNodes) {
        reachable.add(node);
      }
    }

    return milestones
      .map(m => m.id)
      .filter(id => id !== 'initial' && !reachable.has(id));
  }

  /**
   * Find shortest path using Dijkstra's algorithm
   */
  findShortestPath(from: string, to: string): string[] {
    const result = alg.dijkstra(this.graph, from);

    if (!result[to] || result[to].distance === Infinity) {
      return [];
    }

    // Reconstruct path
    const path: string[] = [];
    let current = to;

    while (current !== from) {
      path.unshift(current);
      const predecessor = result[current].predecessor;
      if (!predecessor) break;
      current = predecessor;
    }
    path.unshift(from);

    return path;
  }

  /**
   * Find a critical path from initial to final state
   */
  findCriticalPath(milestones: StateNode[], edges: StateEdge[]): string[] {
    this.buildGraph(milestones, edges);

    // Look for final states
    const finalStates = milestones
      .map(m => m.id)
      .filter(id => id.includes('final') || id.includes('end') || id.includes('space'));

    for (const finalState of finalStates) {
      const path = this.findShortestPath('initial', finalState);
      if (path.length > 0) {
        return path;
      }
    }

    return [];
  }

  /**
   * Get strongly connected components
   */
  findComponents(): string[][] {
    return alg.tarjan(this.graph);
  }

  /**
   * Get topological order (if graph is acyclic)
   */
  getTopologicalOrder(): string[] | null {
    if (!alg.isAcyclic(this.graph)) {
      return null;
    }
    return alg.topsort(this.graph);
  }

  /**
   * Perform full graph analysis
   */
  analyze(): GraphAnalysis {
    const milestones = this.extractMilestones();
    const edges = this.buildEdges(milestones);

    // Build the graph for all algorithms
    this.buildGraph(milestones, edges);

    const cycles = this.detectCycles(edges);
    const deadEnds = this.findDeadEnds(milestones, edges);
    const unreachable = this.findUnreachable(milestones, edges);
    const criticalPath = this.findCriticalPath(milestones, edges);
    const isAcyclic = alg.isAcyclic(this.graph);
    const components = this.findComponents();
    const topologicalOrder = this.getTopologicalOrder();

    return {
      nodes: milestones,
      edges,
      cycles,
      deadEnds,
      unreachable,
      criticalPath,
      milestones,
      isAcyclic,
      components,
      topologicalOrder,
    };
  }

  /**
   * Get the underlying graphlib Graph for advanced operations
   */
  getGraph(): Graph {
    return this.graph;
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
        expectedResult: false,
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
