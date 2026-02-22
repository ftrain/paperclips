/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameHub, createGameHub, GameHubEvents } from './GameHub';
import { GameRegistry, resetGlobalRegistry, getGlobalRegistry } from '../engine/GameRegistry';
import { SaveManager, resetGlobalSaveManager, getGlobalSaveManager } from '../engine/SaveManager';
import { GameManager, resetGlobalManager, getGlobalManager } from '../engine/GameManager';
import { resetGlobalLoader } from '../engine/GameLoader';
import type { GameDefinition, RuntimeState } from '../types/game';

// Create test game definitions
const createTestGame = (id: string, name: string): GameDefinition => ({
  meta: {
    id,
    name,
    version: '1.0.0',
    description: `A test game: ${name}`,
    author: 'Test Author',
  },
  config: {
    tickRate: 100,
  },
  state: [
    { id: 'score', type: 'number', initial: 0 },
  ],
  rules: [],
  projects: [],
  ui: { sections: [] },
});

const testGame1 = createTestGame('game-1', 'Test Game One');
const testGame2 = createTestGame('game-2', 'Test Game Two');

describe('GameHub', () => {
  let container: HTMLElement;
  let registry: GameRegistry;
  let saveManager: SaveManager;

  beforeEach(() => {
    // Reset all global singletons
    resetGlobalRegistry();
    resetGlobalLoader();
    resetGlobalSaveManager();
    resetGlobalManager();

    // Clear localStorage
    localStorage.clear();

    // Create container
    container = document.createElement('div');
    container.id = 'gameHub';
    document.body.appendChild(container);

    // Get fresh instances
    registry = getGlobalRegistry();
    saveManager = getGlobalSaveManager();
  });

  afterEach(() => {
    // Cleanup
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }

    // Stop any running games
    const manager = getGlobalManager();
    if (manager.isGameRunning()) {
      manager.stopCurrentGame(false);
    }
  });

  describe('initialization', () => {
    it('should initialize with container element', () => {
      const hub = new GameHub();
      const result = hub.initialize(container);

      expect(result).toBe(true);
      expect(hub.isInitialized()).toBe(true);
    });

    it('should initialize with container ID', () => {
      const hub = new GameHub({}, { containerId: 'gameHub' });
      const result = hub.initialize();

      expect(result).toBe(true);
    });

    it('should fail if container not found', () => {
      const onError = vi.fn();
      const hub = new GameHub({ onError }, { containerId: 'nonexistent' });
      const result = hub.initialize();

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should render hub structure', () => {
      const hub = new GameHub();
      hub.initialize(container);

      expect(container.querySelector('[data-testid="game-hub"]')).not.toBeNull();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no games registered', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const emptyState = container.querySelector('[data-testid="hub-empty"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState?.textContent).toContain('No games available');
    });
  });

  describe('game list', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should display registered games', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const gameGrid = container.querySelector('[data-testid="game-grid"]');
      expect(gameGrid).not.toBeNull();

      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      const card2 = container.querySelector('[data-testid="game-card-game-2"]');
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
    });

    it('should show game name and version', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      expect(card1?.textContent).toContain('Test Game One');
      expect(card1?.textContent).toContain('v1.0.0');
    });

    it('should show game description', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      expect(card1?.textContent).toContain('A test game: Test Game One');
    });

    it('should show author', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      expect(card1?.textContent).toContain('Test Author');
    });

    it('should have play button for each game', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const playBtn1 = container.querySelector('[data-testid="play-game-1"]');
      const playBtn2 = container.querySelector('[data-testid="play-game-2"]');
      expect(playBtn1).not.toBeNull();
      expect(playBtn2).not.toBeNull();
    });

    it('should show "New Game" when no saves exist', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const playBtn = container.querySelector('[data-testid="play-game-1"]');
      expect(playBtn?.textContent).toContain('New Game');
    });
  });

  describe('with saves', () => {
    const mockRuntime: RuntimeState = {
      state: { score: 100 },
      tick: 50,
      phase: 'main',
      messages: [],
      activeProjects: [],
      completedProjects: {},
      ruleFires: {},
      pendingActions: [],
      entities: [],
    };

    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);

      // Create some saves
      saveManager.save('game-1', '1.0.0', mockRuntime, 'slot1');
      saveManager.save('game-1', '1.0.0', mockRuntime, saveManager.getAutoSaveSlot());
    });

    it('should show save indicator for games with saves', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const indicator = container.querySelector('[data-testid="save-indicator-game-1"]');
      expect(indicator).not.toBeNull();
    });

    it('should not show save indicator for games without saves', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const indicator = container.querySelector('[data-testid="save-indicator-game-2"]');
      expect(indicator).toBeNull();
    });

    it('should show "Continue" when autosave exists', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const playBtn = container.querySelector('[data-testid="play-game-1"]');
      expect(playBtn?.textContent).toContain('Continue');
    });

    it('should show "Load Save" button when saves exist', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]');
      expect(savesBtn).not.toBeNull();
    });

    it('should not show "Load Save" button when no saves', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-2"]');
      expect(savesBtn).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should have search input', () => {
      const hub = new GameHub({}, { showSearch: true });
      hub.initialize(container);

      const searchInput = container.querySelector('[data-testid="game-search"]');
      expect(searchInput).not.toBeNull();
    });

    it('should filter games on search', () => {
      const hub = new GameHub({}, { showSearch: true });
      hub.initialize(container);

      const searchInput = container.querySelector('[data-testid="game-search"]') as HTMLInputElement;

      // Trigger search
      searchInput.value = 'One';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Should only show game 1
      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      const card2 = container.querySelector('[data-testid="game-card-game-2"]');
      expect(card1).not.toBeNull();
      expect(card2).toBeNull();
    });

    it('should show all games when search cleared', () => {
      const hub = new GameHub({}, { showSearch: true });
      hub.initialize(container);

      const searchInput = container.querySelector('[data-testid="game-search"]') as HTMLInputElement;

      // Search then clear
      searchInput.value = 'One';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const card1 = container.querySelector('[data-testid="game-card-game-1"]');
      const card2 = container.querySelector('[data-testid="game-card-game-2"]');
      expect(card1).not.toBeNull();
      expect(card2).not.toBeNull();
    });

    it('should hide search when showSearch is false', () => {
      const hub = new GameHub({}, { showSearch: false });
      hub.initialize(container);

      const searchInput = container.querySelector('[data-testid="game-search"]');
      expect(searchInput).toBeNull();
    });
  });

  describe('game selection', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should call onGameSelected when play clicked', () => {
      const onGameSelected = vi.fn();
      const hub = new GameHub({ onGameSelected });
      hub.initialize(container);

      const playBtn = container.querySelector('[data-testid="play-game-1"]') as HTMLButtonElement;
      playBtn.click();

      expect(onGameSelected).toHaveBeenCalledWith('game-1', true);
    });

    it('should call onGameStarted when game starts', () => {
      const onGameStarted = vi.fn();
      const hub = new GameHub({ onGameStarted });
      hub.initialize(container);

      const playBtn = container.querySelector('[data-testid="play-game-1"]') as HTMLButtonElement;
      playBtn.click();

      expect(onGameStarted).toHaveBeenCalled();
      const session = onGameStarted.mock.calls[0][0];
      expect(session.gameId).toBe('game-1');
    });

    it('should start game engine when play clicked', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const playBtn = container.querySelector('[data-testid="play-game-1"]') as HTMLButtonElement;
      playBtn.click();

      const manager = getGlobalManager();
      expect(manager.isGameRunning()).toBe(true);
      expect(manager.getCurrentGameId()).toBe('game-1');
    });
  });

  describe('save slot modal', () => {
    const mockRuntime: RuntimeState = {
      state: { score: 100 },
      tick: 50,
      phase: 'main',
      messages: [],
      activeProjects: [],
      completedProjects: {},
      ruleFires: {},
      pendingActions: [],
      entities: [],
    };

    beforeEach(() => {
      registry.register(testGame1);
      saveManager.save('game-1', '1.0.0', mockRuntime, 'slot1');
      saveManager.save('game-1', '1.0.0', mockRuntime, 'slot2');
    });

    it('should open modal when Load Save clicked', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]') as HTMLButtonElement;
      savesBtn.click();

      const modal = container.querySelector('#saveSlotModal') as HTMLElement;
      expect(modal.style.display).toBe('flex');
    });

    it('should show save slots in modal', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]') as HTMLButtonElement;
      savesBtn.click();

      const slotList = container.querySelector('[data-testid="save-slot-list"]');
      expect(slotList).not.toBeNull();

      const slot1 = container.querySelector('[data-testid="save-slot-slot1"]');
      const slot2 = container.querySelector('[data-testid="save-slot-slot2"]');
      expect(slot1).not.toBeNull();
      expect(slot2).not.toBeNull();
    });

    it('should close modal when close button clicked', () => {
      const hub = new GameHub();
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]') as HTMLButtonElement;
      savesBtn.click();

      const closeBtn = container.querySelector('[data-testid="close-modal"]') as HTMLButtonElement;
      closeBtn.click();

      const modal = container.querySelector('#saveSlotModal') as HTMLElement;
      expect(modal.style.display).toBe('none');
    });

    it('should load save when slot clicked', () => {
      const onGameSelected = vi.fn();
      const hub = new GameHub({ onGameSelected });
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]') as HTMLButtonElement;
      savesBtn.click();

      const loadBtn = container.querySelector('[data-testid="load-slot-slot1"]') as HTMLButtonElement;
      loadBtn.click();

      expect(onGameSelected).toHaveBeenCalledWith('game-1', false);
    });

    it('should start new game when New Game button clicked', () => {
      const onGameSelected = vi.fn();
      const hub = new GameHub({ onGameSelected });
      hub.initialize(container);

      const savesBtn = container.querySelector('[data-testid="saves-game-1"]') as HTMLButtonElement;
      savesBtn.click();

      const newGameBtn = container.querySelector('[data-testid="new-game-btn"]') as HTMLButtonElement;
      newGameBtn.click();

      expect(onGameSelected).toHaveBeenCalledWith('game-1', true);
    });
  });

  describe('factory function', () => {
    it('should create GameHub instance', () => {
      const hub = createGameHub();
      expect(hub).toBeInstanceOf(GameHub);
    });

    it('should pass events and options', () => {
      const onError = vi.fn();
      const hub = createGameHub({ onError }, { containerId: 'invalid' });
      hub.initialize();

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      registry.register(testGame1);
    });

    it('should update display after refresh', () => {
      const hub = new GameHub();
      hub.initialize(container);

      // Register another game
      registry.register(testGame2);

      // Refresh
      hub.refresh();

      const card2 = container.querySelector('[data-testid="game-card-game-2"]');
      expect(card2).not.toBeNull();
    });
  });
});
