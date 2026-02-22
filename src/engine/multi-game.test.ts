/**
 * Tests for multi-game support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameDefinition } from '../types/game';
import { GameRegistry, resetGlobalRegistry, getGlobalRegistry } from './GameRegistry';
import { GameLoader, resetGlobalLoader, getGlobalLoader } from './GameLoader';
import { SaveManager, resetGlobalSaveManager, getGlobalSaveManager } from './SaveManager';
import { GameManager, resetGlobalManager, getGlobalManager } from './GameManager';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Sample game definitions for testing
const createTestGame = (id: string, name: string): GameDefinition => ({
  meta: {
    id,
    name,
    version: '1.0.0',
    description: `Test game: ${name}`,
    author: 'Test Author',
  },
  config: {
    tickRate: 100,
  },
  state: [
    { id: 'counter', type: 'number', initial: 0 },
    { id: 'active', type: 'boolean', initial: false },
  ],
  rules: [],
  projects: [],
  ui: { sections: [] },
});

const testGame1 = createTestGame('test-game-1', 'Test Game 1');
const testGame2 = createTestGame('test-game-2', 'Test Game 2');

describe('GameRegistry', () => {
  let registry: GameRegistry;

  beforeEach(() => {
    resetGlobalRegistry();
    registry = new GameRegistry();
  });

  describe('registration', () => {
    it('should register a game successfully', () => {
      const result = registry.register(testGame1);

      expect(result.success).toBe(true);
      expect(result.gameId).toBe('test-game-1');
    });

    it('should set first registered game as default', () => {
      registry.register(testGame1);

      expect(registry.getDefaultId()).toBe('test-game-1');
    });

    it('should not override default when registering additional games', () => {
      registry.register(testGame1);
      registry.register(testGame2);

      expect(registry.getDefaultId()).toBe('test-game-1');
    });

    it('should allow setting a game as default on registration', () => {
      registry.register(testGame1);
      registry.register(testGame2, { setAsDefault: true });

      expect(registry.getDefaultId()).toBe('test-game-2');
    });

    it('should replace existing game with same ID', () => {
      registry.register(testGame1);

      const updatedGame = { ...testGame1, meta: { ...testGame1.meta, version: '2.0.0' } };
      registry.register(updatedGame);

      expect(registry.get('test-game-1')?.meta.version).toBe('2.0.0');
    });

    it('should validate game definition when validate option is true', () => {
      const invalidGame = { meta: { id: 'bad' } };
      const result = registry.register(invalidGame as GameDefinition, { validate: true });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should register multiple games at once', () => {
      const results = registry.registerAll([testGame1, testGame2]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(registry.size).toBe(2);
    });
  });

  describe('retrieval', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should get game by ID', () => {
      const game = registry.get('test-game-1');
      expect(game).toEqual(testGame1);
    });

    it('should return undefined for non-existent game', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });

    it('should get default game', () => {
      expect(registry.getDefault()).toEqual(testGame1);
    });

    it('should check if game exists', () => {
      expect(registry.has('test-game-1')).toBe(true);
      expect(registry.has('non-existent')).toBe(false);
    });

    it('should list all game IDs', () => {
      expect(registry.getIds()).toEqual(['test-game-1', 'test-game-2']);
    });

    it('should list all game info', () => {
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('test-game-1');
      expect(list[0].name).toBe('Test Game 1');
    });
  });

  describe('unregistration', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should unregister a game', () => {
      const result = registry.unregister('test-game-1');

      expect(result).toBe(true);
      expect(registry.has('test-game-1')).toBe(false);
    });

    it('should pick new default when default is unregistered', () => {
      registry.unregister('test-game-1');
      expect(registry.getDefaultId()).toBe('test-game-2');
    });

    it('should return false when unregistering non-existent game', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(testGame1);
      registry.register(testGame2);
    });

    it('should search games by name', () => {
      const results = registry.search('Game 1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-game-1');
    });

    it('should search games by description', () => {
      const results = registry.search('Test game');
      expect(results).toHaveLength(2);
    });

    it('should find games by author', () => {
      const games = registry.findByAuthor('Test Author');
      expect(games).toHaveLength(2);
    });
  });

  describe('global registry', () => {
    it('should return same instance', () => {
      const r1 = getGlobalRegistry();
      const r2 = getGlobalRegistry();
      expect(r1).toBe(r2);
    });

    it('should reset global registry', () => {
      const r1 = getGlobalRegistry();
      r1.register(testGame1);

      resetGlobalRegistry();

      const r2 = getGlobalRegistry();
      expect(r2.size).toBe(0);
    });
  });
});

describe('GameLoader', () => {
  let loader: GameLoader;

  beforeEach(() => {
    resetGlobalLoader();
    loader = new GameLoader();
  });

  describe('loadFromObject', () => {
    it('should load a valid game object', () => {
      const result = loader.loadFromObject(testGame1);

      expect(result.success).toBe(true);
      expect(result.game).toEqual(testGame1);
    });

    it('should cache loaded game by default', () => {
      loader.loadFromObject(testGame1);

      expect(loader.isCached('test-game-1')).toBe(true);
    });

    it('should not cache when cache option is false', () => {
      loader.loadFromObject(testGame1, { cache: false });

      expect(loader.isCached('test-game-1')).toBe(false);
    });

    it('should fail validation for invalid game', () => {
      const result = loader.loadFromObject({ invalid: true });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should skip validation when validate is false', () => {
      const result = loader.loadFromObject({ meta: { id: 'x', name: 'x', version: '1' } } as GameDefinition, { validate: false });

      expect(result.success).toBe(true);
    });
  });

  describe('loadFromString', () => {
    it('should parse and load a JSON string', () => {
      const jsonString = JSON.stringify(testGame1);
      const result = loader.loadFromString(jsonString);

      expect(result.success).toBe(true);
      expect(result.game?.meta.id).toBe('test-game-1');
    });

    it('should fail on invalid JSON', () => {
      const result = loader.loadFromString('not json');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Failed to parse JSON');
    });
  });

  describe('cache management', () => {
    beforeEach(() => {
      loader.loadFromObject(testGame1);
      loader.loadFromObject(testGame2);
    });

    it('should get cached games', () => {
      expect(loader.getCached('test-game-1')).toEqual(testGame1);
    });

    it('should get all cached games', () => {
      expect(loader.getCachedGames()).toHaveLength(2);
    });

    it('should clear specific cache entry', () => {
      loader.clearCache('test-game-1');

      expect(loader.isCached('test-game-1')).toBe(false);
      expect(loader.isCached('test-game-2')).toBe(true);
    });

    it('should clear all cache', () => {
      loader.clearCache();

      expect(loader.cacheSize).toBe(0);
    });

    it('should get cache info', () => {
      const info = loader.getCacheInfo();

      expect(info).toHaveLength(2);
      expect(info[0]).toHaveProperty('id');
      expect(info[0]).toHaveProperty('source');
      expect(info[0]).toHaveProperty('loadedAt');
    });
  });

  describe('loadAll', () => {
    it('should load multiple games', () => {
      const results = loader.loadAll([testGame1, testGame2]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('global loader', () => {
    it('should return same instance', () => {
      expect(getGlobalLoader()).toBe(getGlobalLoader());
    });
  });
});

describe('SaveManager', () => {
  let saveManager: SaveManager;

  beforeEach(() => {
    localStorageMock.clear();
    resetGlobalSaveManager();
    saveManager = new SaveManager();
  });

  const createMockRuntime = () => ({
    state: { counter: 10, active: true },
    tick: 100,
    phase: 'main',
    messages: [],
    activeProjects: [],
    completedProjects: { 'proj-1': 1 },
    ruleFires: { 'rule-1': { count: 5, lastTick: 90 } },
    pendingActions: [],
    entities: [],
  });

  describe('save and load', () => {
    it('should save game state', () => {
      const runtime = createMockRuntime();
      const result = saveManager.save('test-game-1', '1.0.0', runtime, 'slot1');

      expect(result).toBe(true);
      expect(saveManager.exists('test-game-1', 'slot1')).toBe(true);
    });

    it('should load saved state', () => {
      const runtime = createMockRuntime();
      saveManager.save('test-game-1', '1.0.0', runtime, 'slot1');

      const loaded = saveManager.load('test-game-1', 'slot1');

      expect(loaded).not.toBeNull();
      expect(loaded?.state.counter).toBe(10);
      expect(loaded?.tick).toBe(100);
      expect(loaded?.phase).toBe('main');
    });

    it('should return null for non-existent save', () => {
      expect(saveManager.load('test-game-1', 'non-existent')).toBeNull();
    });

    it('should include metadata in save', () => {
      const runtime = createMockRuntime();
      saveManager.save('test-game-1', '1.0.0', runtime, 'slot1');

      const loaded = saveManager.load('test-game-1', 'slot1');

      expect(loaded?.gameId).toBe('test-game-1');
      expect(loaded?.gameVersion).toBe('1.0.0');
      expect(loaded?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('delete', () => {
    it('should delete a save slot', () => {
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot1');

      const result = saveManager.delete('test-game-1', 'slot1');

      expect(result).toBe(true);
      expect(saveManager.exists('test-game-1', 'slot1')).toBe(false);
    });

    it('should delete all saves for a game', () => {
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot1');
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot2');

      saveManager.deleteAll('test-game-1');

      expect(saveManager.exists('test-game-1', 'slot1')).toBe(false);
      expect(saveManager.exists('test-game-1', 'slot2')).toBe(false);
    });
  });

  describe('save slots', () => {
    it('should list save slots for a game', () => {
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot1');
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot2');

      const slots = saveManager.getSaveSlots('test-game-1');

      expect(slots).toHaveLength(2);
      expect(slots[0].slot).toBe('slot1');
      expect(slots[1].slot).toBe('slot2');
    });

    it('should return empty array for game with no saves', () => {
      expect(saveManager.getSaveSlots('no-saves')).toHaveLength(0);
    });
  });

  describe('autosave', () => {
    it('should check for autosave', () => {
      expect(saveManager.hasAutoSave('test-game-1')).toBe(false);

      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), saveManager.getAutoSaveSlot());

      expect(saveManager.hasAutoSave('test-game-1')).toBe(true);
    });
  });

  describe('export and import', () => {
    it('should export save as JSON', () => {
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot1');

      const exported = saveManager.export('test-game-1', 'slot1');

      expect(exported).not.toBeNull();
      expect(() => JSON.parse(exported!)).not.toThrow();
    });

    it('should import save from JSON', () => {
      saveManager.save('test-game-1', '1.0.0', createMockRuntime(), 'slot1');
      const exported = saveManager.export('test-game-1', 'slot1')!;

      saveManager.delete('test-game-1', 'slot1');

      const result = saveManager.import(exported);

      expect(result.success).toBe(true);
      expect(saveManager.exists('test-game-1', 'slot1')).toBe(true);
    });
  });

  describe('play time tracking', () => {
    it('should track play time', async () => {
      saveManager.startPlayTime('test-game-1');

      await new Promise(resolve => setTimeout(resolve, 50));

      const playTime = saveManager.getSessionPlayTime('test-game-1');
      expect(playTime).toBeGreaterThanOrEqual(40);
    });
  });

  describe('saved games list', () => {
    it('should list all games with saves', () => {
      saveManager.save('game-1', '1.0.0', createMockRuntime(), 'slot1');
      saveManager.save('game-2', '1.0.0', createMockRuntime(), 'slot1');

      const games = saveManager.getSavedGames();

      expect(games).toContain('game-1');
      expect(games).toContain('game-2');
    });
  });

  describe('global save manager', () => {
    it('should return same instance', () => {
      expect(getGlobalSaveManager()).toBe(getGlobalSaveManager());
    });
  });
});

describe('GameManager', () => {
  let manager: GameManager;
  let registry: GameRegistry;
  let loader: GameLoader;
  let saveManager: SaveManager;

  beforeEach(() => {
    localStorageMock.clear();
    resetGlobalRegistry();
    resetGlobalLoader();
    resetGlobalSaveManager();
    resetGlobalManager();

    registry = new GameRegistry();
    loader = new GameLoader();
    saveManager = new SaveManager();

    manager = new GameManager({}, { autoLoadOnStart: false });
    manager.useCustomInstances(registry, loader, saveManager);

    // Pre-register test games
    manager.registerGame(testGame1);
    manager.registerGame(testGame2);
  });

  afterEach(() => {
    if (manager.isGameRunning()) {
      manager.stopCurrentGame(false);
    }
  });

  describe('game registration', () => {
    it('should register games', () => {
      expect(manager.hasGame('test-game-1')).toBe(true);
      expect(manager.hasGame('test-game-2')).toBe(true);
    });

    it('should get game list', () => {
      const games = manager.getGames();
      expect(games).toHaveLength(2);
    });

    it('should get game by ID', () => {
      expect(manager.getGame('test-game-1')).toEqual(testGame1);
    });

    it('should unregister game', () => {
      manager.unregisterGame('test-game-2');
      expect(manager.hasGame('test-game-2')).toBe(false);
    });
  });

  describe('game lifecycle', () => {
    it('should start a game', () => {
      const result = manager.startGame('test-game-1');

      expect(result).toBe(true);
      expect(manager.isGameRunning()).toBe(true);
      expect(manager.getCurrentGameId()).toBe('test-game-1');
    });

    it('should start default game', () => {
      manager.startDefaultGame();

      expect(manager.isGameRunning()).toBe(true);
    });

    it('should stop current game', () => {
      manager.startGame('test-game-1');
      manager.stopCurrentGame(false);

      expect(manager.isGameRunning()).toBe(false);
      expect(manager.getCurrentGameId()).toBeNull();
    });

    it('should switch between games', () => {
      manager.startGame('test-game-1');
      manager.switchGame('test-game-2');

      expect(manager.getCurrentGameId()).toBe('test-game-2');
    });

    it('should restart current game', () => {
      manager.startGame('test-game-1');
      const engine = manager.getCurrentEngine()!;
      engine.setState('counter', 50);

      manager.restartCurrentGame();

      expect(engine.getState('counter')).toBe(0);
    });

    it('should get current session', () => {
      manager.startGame('test-game-1');

      const session = manager.getCurrentSession();

      expect(session).not.toBeNull();
      expect(session?.gameId).toBe('test-game-1');
      expect(session?.engine).not.toBeNull();
    });

    it('should get current game definition', () => {
      manager.startGame('test-game-1');

      expect(manager.getCurrentGameDefinition()).toEqual(testGame1);
    });
  });

  describe('save/load integration', () => {
    beforeEach(() => {
      manager.startGame('test-game-1');
    });

    it('should save current game', () => {
      manager.getCurrentEngine()!.setState('counter', 42);

      const result = manager.saveGame('test-slot');

      expect(result).toBe(true);
    });

    it('should load saved game', () => {
      manager.getCurrentEngine()!.setState('counter', 42);
      manager.saveGame('test-slot');
      manager.getCurrentEngine()!.setState('counter', 0);

      manager.loadGame('test-slot');

      expect(manager.getCurrentEngine()!.getState('counter')).toBe(42);
    });

    it('should autosave', () => {
      manager.autoSave();

      expect(saveManager.hasAutoSave('test-game-1')).toBe(true);
    });

    it('should get save slots', () => {
      manager.saveGame('slot1');
      manager.saveGame('slot2');

      const slots = manager.getSaveSlots();

      expect(slots.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete save', () => {
      manager.saveGame('to-delete');
      manager.deleteSave('to-delete');

      expect(saveManager.exists('test-game-1', 'to-delete')).toBe(false);
    });

    it('should export and import saves', () => {
      manager.getCurrentEngine()!.setState('counter', 99);
      manager.saveGame('export-test');

      const exported = manager.exportSave('export-test');
      expect(exported).not.toBeNull();

      manager.deleteSave('export-test');
      manager.importSave(exported!);

      expect(saveManager.exists('test-game-1', 'export-test')).toBe(true);
    });
  });

  describe('game discovery', () => {
    it('should find games with saves', () => {
      manager.startGame('test-game-1');
      manager.saveGame('slot1');
      manager.stopCurrentGame(false);

      const gamesWithSaves = manager.getGamesWithSaves();

      expect(gamesWithSaves.some(g => g.id === 'test-game-1')).toBe(true);
    });

    it('should search games', () => {
      const results = manager.searchGames('Game 1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-game-1');
    });
  });

  describe('utilities', () => {
    it('should get game count', () => {
      expect(manager.gameCount).toBe(2);
    });

    it('should get storage usage', () => {
      manager.startGame('test-game-1');
      manager.saveGame('slot1');

      const usage = manager.getStorageUsage();

      expect(usage.total).toBeGreaterThan(0);
    });

    it('should clear game data', () => {
      manager.startGame('test-game-1');
      manager.saveGame('slot1');
      manager.stopCurrentGame(false);

      manager.clearGameData('test-game-1');

      expect(saveManager.getSaveSlots('test-game-1')).toHaveLength(0);
    });
  });

  describe('global manager', () => {
    it('should return same instance', () => {
      expect(getGlobalManager()).toBe(getGlobalManager());
    });
  });
});
