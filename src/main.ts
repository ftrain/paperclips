/**
 * Universal Paperclips - Main Entry Point
 *
 * A JSON-driven idle game engine implementation.
 */

import { GameEngine } from './engine/GameEngine';
import { UIRenderer } from './ui/UIRenderer';
import gameDefinition from './game.json';
import type { GameDefinition, GameMessage } from './types/game';

// Declare global for debugging
declare global {
  interface Window {
    game: GameEngine;
    ui: UIRenderer;
  }
}

/**
 * Initialize and start the game
 */
function initGame(): void {
  console.log('Initializing Universal Paperclips...');
  console.log(`Game: ${gameDefinition.meta.name} v${gameDefinition.meta.version}`);

  // Create game engine
  const engine = new GameEngine(gameDefinition as GameDefinition, {
    onStateChange: () => {
      window.ui?.update();
    },
    onMessage: (message: GameMessage) => {
      window.ui?.showMessage(message);
    },
    onProjectsChange: () => {
      window.ui?.update();
    },
    onTick: (tick: number) => {
      if (tick % 10 === 0) {
        window.ui?.update();
      }
    },
  });

  // Create UI renderer
  const ui = new UIRenderer(engine);

  // Expose to window for debugging
  window.game = engine;
  window.ui = ui;

  // Initialize UI
  ui.initialize();

  // Try to load existing save
  if (engine.load('default')) {
    console.log('Loaded saved game');
  }

  // Start the game loop
  engine.start();

  // Hide loading cover
  const cover = document.getElementById('cover');
  if (cover) {
    cover.style.display = 'none';
  }

  console.log('Game started!');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}

// Export for module usage
export { initGame };
