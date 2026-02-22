/**
 * UIRenderer - Binds game state to DOM elements
 *
 * This module handles:
 * - Reading UI bindings from the game definition
 * - Updating DOM elements based on state changes
 * - Handling button clicks and user interactions
 * - Managing visibility of UI sections
 */

import type {
  GameDefinition,
  UIBinding,
  UISectionDefinition,
  EvaluationContext,
  GameMessage,
  ProjectDefinition,
} from '../types/game';

import { GameEngine } from '../engine/GameEngine';
import { evaluateExpression, evaluateCondition, formatValue } from '../engine/evaluator';
import { canAfford } from '../engine/actions';

export class UIRenderer {
  private engine: GameEngine;
  private definition: GameDefinition;
  private projectContainer: HTMLElement | null = null;
  private messageContainer: HTMLElement | null = null;
  private boundButtons: Map<string, () => void> = new Map();

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.definition = engine.getDefinition();

    // Set up engine event handlers
    this.engine = engine;
  }

  /**
   * Initialize the UI renderer
   */
  initialize(): void {
    this.projectContainer = document.getElementById('projectListTop');
    this.messageContainer = document.getElementById('readout1');

    this.bindAllSections();
    this.update();
  }

  /**
   * Bind all UI sections
   */
  private bindAllSections(): void {
    for (const section of this.definition.ui.sections) {
      this.bindSection(section);
    }
  }

  /**
   * Bind a single UI section
   */
  private bindSection(section: UISectionDefinition): void {
    for (const binding of section.bindings) {
      this.bindElement(binding, section);
    }
  }

  /**
   * Bind a single UI element
   */
  private bindElement(binding: UIBinding, section: UISectionDefinition): void {
    const element = document.getElementById(binding.elementId);
    if (!element) return;

    // Handle button bindings
    if (binding.type === 'button' && binding.onClick) {
      const handler = () => {
        this.engine.playerAction(binding.onClick!);
        this.update();
      };

      // Remove old handler if exists
      const oldHandler = this.boundButtons.get(binding.elementId);
      if (oldHandler) {
        element.removeEventListener('click', oldHandler);
      }

      element.addEventListener('click', handler);
      this.boundButtons.set(binding.elementId, handler);
    }
  }

  /**
   * Update all UI elements
   */
  update(): void {
    const ctx = this.getContext();

    for (const section of this.definition.ui.sections) {
      this.updateSection(section, ctx);
    }

    this.updateProjects(ctx);
    this.updateMessages();
  }

  /**
   * Get current evaluation context
   */
  private getContext(): EvaluationContext {
    const runtime = this.engine.getRuntime();
    return {
      state: runtime.state,
      tick: runtime.tick,
      deltaTime: 0,
      random: Math.random,
      functions: this.definition.functions,
    };
  }

  /**
   * Update a UI section
   */
  private updateSection(section: UISectionDefinition, ctx: EvaluationContext): void {
    // Check section visibility
    if (section.visible) {
      const visible = evaluateCondition(section.visible, ctx);
      const sectionElement = document.getElementById(section.id);
      if (sectionElement) {
        sectionElement.style.display = visible ? '' : 'none';
      }
    }

    for (const binding of section.bindings) {
      this.updateBinding(binding, ctx);
    }
  }

  /**
   * Update a single binding
   */
  private updateBinding(binding: UIBinding, ctx: EvaluationContext): void {
    const element = document.getElementById(binding.elementId);
    if (!element) return;

    switch (binding.type) {
      case 'text':
      case 'display': {
        if (binding.value !== undefined) {
          const value = evaluateExpression(binding.value, ctx);
          let text = formatValue(value, binding.format, binding.precision);

          if (binding.prefix) text = binding.prefix + text;
          if (binding.suffix) text = text + binding.suffix;

          element.textContent = text;
        }
        break;
      }

      case 'visibility': {
        if (binding.visible) {
          const visible = evaluateCondition(binding.visible, ctx);
          element.style.display = visible ? '' : 'none';
        }
        break;
      }

      case 'button': {
        if (binding.enabled) {
          const enabled = evaluateCondition(binding.enabled, ctx);
          (element as HTMLButtonElement).disabled = !enabled;
        }
        break;
      }

      case 'progress': {
        if (binding.current !== undefined && binding.max !== undefined) {
          const current = evaluateExpression(binding.current, ctx);
          const max = evaluateExpression(binding.max, ctx);
          const currentNum = typeof current === 'number' ? current : 0;
          const maxNum = typeof max === 'number' ? max : 1;
          const pct = Math.min(100, (currentNum / maxNum) * 100);
          element.style.width = `${pct}%`;
        }
        break;
      }

      case 'class': {
        if (binding.class && binding.condition) {
          const active = evaluateCondition(binding.condition, ctx);
          if (active) {
            element.classList.add(binding.class);
          } else {
            element.classList.remove(binding.class);
          }
        }
        break;
      }

      case 'style': {
        if (binding.style) {
          for (const [prop, value] of Object.entries(binding.style)) {
            const evaledValue = typeof value === 'string'
              ? value
              : String(evaluateExpression(value, ctx));
            (element.style as Record<string, string>)[prop] = evaledValue;
          }
        }
        break;
      }
    }
  }

  /**
   * Update the projects list
   */
  private updateProjects(ctx: EvaluationContext): void {
    if (!this.projectContainer) return;

    const runtime = this.engine.getRuntime();
    const activeProjects = runtime.activeProjects;

    // Remove projects that are no longer active
    const existingButtons = this.projectContainer.querySelectorAll('.projectButton');
    existingButtons.forEach(btn => {
      const id = btn.id.replace('projectButton-', '');
      if (!activeProjects.includes(id)) {
        btn.remove();
      }
    });

    // Add new projects
    for (const projectId of activeProjects) {
      const existingBtn = document.getElementById(`projectButton-${projectId}`);
      if (existingBtn) {
        // Update existing button
        this.updateProjectButton(existingBtn as HTMLButtonElement, projectId, ctx);
        continue;
      }

      const project = this.engine.getProject(projectId);
      if (!project) continue;

      const button = this.createProjectButton(project);
      this.projectContainer.appendChild(button);
    }
  }

  /**
   * Create a project button element
   */
  private createProjectButton(project: ProjectDefinition): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = `projectButton-${project.id}`;
    button.className = 'projectButton';

    const title = document.createElement('span');
    title.className = 'projectTitle';
    title.textContent = project.name;

    const priceTag = document.createElement('span');
    priceTag.className = 'projectPriceTag';
    priceTag.textContent = project.priceTag || '';

    const description = document.createElement('span');
    description.className = 'projectDescription';
    description.textContent = project.description;

    button.appendChild(title);
    button.appendChild(document.createElement('br'));
    button.appendChild(priceTag);
    button.appendChild(document.createElement('br'));
    button.appendChild(description);

    button.addEventListener('click', () => {
      if (this.engine.purchaseProject(project.id)) {
        this.update();
      }
    });

    return button;
  }

  /**
   * Update an existing project button
   */
  private updateProjectButton(button: HTMLButtonElement, projectId: string, ctx: EvaluationContext): void {
    const project = this.engine.getProject(projectId);
    if (!project) return;

    const affordable = canAfford(project.costs, ctx);
    button.disabled = !affordable;
  }

  /**
   * Update messages display
   */
  private updateMessages(): void {
    const messages = this.engine.getMessages(5);

    // Update main message
    const mainMsg = document.getElementById('readout1');
    if (mainMsg && messages.length > 0) {
      mainMsg.textContent = messages[messages.length - 1].text;
    }

    // Update older messages
    for (let i = 2; i <= 5; i++) {
      const elem = document.getElementById(`readout${i}`);
      if (elem) {
        const msgIndex = messages.length - i;
        if (msgIndex >= 0) {
          elem.textContent = messages[msgIndex].text;
        } else {
          elem.textContent = '';
        }
      }
    }
  }

  /**
   * Display a message immediately
   */
  showMessage(message: GameMessage): void {
    // Shift old messages
    for (let i = 5; i > 1; i--) {
      const prev = document.getElementById(`readout${i - 1}`);
      const curr = document.getElementById(`readout${i}`);
      if (prev && curr) {
        curr.textContent = prev.textContent;
      }
    }

    // Show new message
    const mainMsg = document.getElementById('readout1');
    if (mainMsg) {
      mainMsg.textContent = message.text;
    }
  }
}
