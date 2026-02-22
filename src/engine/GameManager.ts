/**
 * GameManager - Orchestrates multiple games
 *
 * Provides:
 * - Game lifecycle management
 * - Switching between games
 * - Coordinated save/load
 * - Event handling across games
 */

import type { GameDefinition, GameMessage, SpawnedEntity } from '../types/game';
import { GameEngine, GameEngineEvents } from './GameEngine';
import { GameRegistry, getGlobalRegistry, GameInfo, RegistrationResult } from './GameRegistry';
import { GameLoader, getGlobalLoader, LoadResult, LoadOptions } from './GameLoader';
import { SaveManager, getGlobalSaveManager, SaveData, SaveSlotInfo } from './SaveManager';
import type { AnimateOptions, SoundOptions } from './actions';

/**
 * Events emitted by GameManager
 */
export interface GameManagerEvents {
  onGameChange?: (gameId: string | null, engine: GameEngine | null) => void;
  onGameLoaded?: (gameId: string) => void;
  onGameUnloaded?: (gameId: string) => void;
  onSave?: (gameId: string, slot: string) => void;
  onLoad?: (gameId: string, slot: string) => void;
  onError?: (error: string) => void;
}

/**
 * Configuration for GameManager
 */
export interface GameManagerConfig {
  autoSaveOnSwitch?: boolean;  // Auto-save when switching games (default: true)
  autoLoadOnStart?: boolean;   // Auto-load last save when starting (default: true)
  engineEvents?: GameEngineEvents;  // Events to pass to game engines
}

/**
 * State of the current game session
 */
export interface GameSession {
  gameId: string;
  engine: GameEngine;
  startedAt: number;
  lastSaveSlot: string | null;
}

/**
 * Manages multiple games and their lifecycle
 */
export class GameManager {
  private registry: GameRegistry;
  private loader: GameLoader;
  private saveManager: SaveManager;
  private events: GameManagerEvents;
  private config: GameManagerConfig;
  private currentSession: GameSession | null = null;

  constructor(
    events: GameManagerEvents = {},
    config: GameManagerConfig = {}
  ) {
    this.registry = getGlobalRegistry();
    this.loader = getGlobalLoader();
    this.saveManager = getGlobalSaveManager();
    this.events = events;
    this.config = {
      autoSaveOnSwitch: config.autoSaveOnSwitch ?? true,
      autoLoadOnStart: config.autoLoadOnStart ?? true,
      engineEvents: config.engineEvents,
    };
  }

  /**
   * Use custom instances instead of global singletons
   */
  useCustomInstances(
    registry: GameRegistry,
    loader: GameLoader,
    saveManager: SaveManager
  ): void {
    this.registry = registry;
    this.loader = loader;
    this.saveManager = saveManager;
  }

  // ============================================================================
  // GAME REGISTRATION
  // ============================================================================

  /**
   * Register a game definition
   */
  registerGame(
    definition: GameDefinition,
    options: { validate?: boolean; setAsDefault?: boolean } = {}
  ): RegistrationResult {
    return this.registry.register(definition, options);
  }

  /**
   * Register multiple games
   */
  registerGames(
    definitions: GameDefinition[],
    options: { validate?: boolean } = {}
  ): RegistrationResult[] {
    return this.registry.registerAll(definitions, options);
  }

  /**
   * Load and register a game from a URL
   */
  async loadAndRegisterFromUrl(
    url: string,
    options: LoadOptions & { setAsDefault?: boolean } = {}
  ): Promise<RegistrationResult> {
    const loadResult = await this.loader.loadFromUrl(url, options);

    if (!loadResult.success || !loadResult.game) {
      return {
        success: false,
        errors: loadResult.errors || ['Failed to load game'],
      };
    }

    return this.registry.register(loadResult.game, {
      validate: false,  // Already validated by loader
      setAsDefault: options.setAsDefault,
    });
  }

  /**
   * Load and register a game from a file
   */
  async loadAndRegisterFromFile(
    filePath: string,
    options: LoadOptions & { setAsDefault?: boolean } = {}
  ): Promise<RegistrationResult> {
    const loadResult = await this.loader.loadFromFile(filePath, options);

    if (!loadResult.success || !loadResult.game) {
      return {
        success: false,
        errors: loadResult.errors || ['Failed to load game'],
      };
    }

    return this.registry.register(loadResult.game, {
      validate: false,
      setAsDefault: options.setAsDefault,
    });
  }

  /**
   * Unregister a game
   */
  unregisterGame(gameId: string): boolean {
    // Stop if currently playing this game
    if (this.currentSession?.gameId === gameId) {
      this.stopCurrentGame();
    }

    return this.registry.unregister(gameId);
  }

  /**
   * Get all registered games
   */
  getGames(): GameInfo[] {
    return this.registry.list();
  }

  /**
   * Get a specific game definition
   */
  getGame(gameId: string): GameDefinition | undefined {
    return this.registry.get(gameId);
  }

  /**
   * Check if a game is registered
   */
  hasGame(gameId: string): boolean {
    return this.registry.has(gameId);
  }

  // ============================================================================
  // GAME LIFECYCLE
  // ============================================================================

  /**
   * Start a game
   */
  startGame(gameId: string, loadSlot?: string): boolean {
    const definition = this.registry.get(gameId);
    if (!definition) {
      this.events.onError?.(`Game not found: ${gameId}`);
      return false;
    }

    // Stop current game if running
    if (this.currentSession) {
      this.stopCurrentGame();
    }

    // Create engine with combined events
    const engineEvents: GameEngineEvents = {
      ...this.config.engineEvents,
    };

    const engine = new GameEngine(definition, engineEvents);

    // Set up session
    this.currentSession = {
      gameId,
      engine,
      startedAt: Date.now(),
      lastSaveSlot: null,
    };

    // Start play time tracking
    this.saveManager.startPlayTime(gameId);

    // Load save if requested or auto-load
    if (loadSlot) {
      this.loadGame(loadSlot);
    } else if (this.config.autoLoadOnStart) {
      // Try to load autosave
      if (this.saveManager.hasAutoSave(gameId)) {
        this.loadGame(this.saveManager.getAutoSaveSlot());
      }
    }

    // Start the game loop
    engine.start();

    this.events.onGameChange?.(gameId, engine);
    this.events.onGameLoaded?.(gameId);

    return true;
  }

  /**
   * Start the default game
   */
  startDefaultGame(loadSlot?: string): boolean {
    const defaultId = this.registry.getDefaultId();
    if (!defaultId) {
      this.events.onError?.('No default game set');
      return false;
    }

    return this.startGame(defaultId, loadSlot);
  }

  /**
   * Stop the current game
   */
  stopCurrentGame(autoSave: boolean = true): boolean {
    if (!this.currentSession) {
      return false;
    }

    const { gameId, engine } = this.currentSession;

    // Auto-save if enabled
    if (autoSave && this.config.autoSaveOnSwitch) {
      this.autoSave();
    }

    // Stop the engine
    engine.stop();

    this.currentSession = null;

    this.events.onGameUnloaded?.(gameId);
    this.events.onGameChange?.(null, null);

    return true;
  }

  /**
   * Switch to a different game
   */
  switchGame(gameId: string, loadSlot?: string): boolean {
    return this.startGame(gameId, loadSlot);
  }

  /**
   * Restart the current game (reset to initial state)
   */
  restartCurrentGame(): boolean {
    if (!this.currentSession) {
      return false;
    }

    this.currentSession.engine.reset();
    this.currentSession.startedAt = Date.now();
    this.saveManager.startPlayTime(this.currentSession.gameId);

    return true;
  }

  // ============================================================================
  // SAVE/LOAD
  // ============================================================================

  /**
   * Save the current game
   */
  saveGame(slot: string = 'default'): boolean {
    if (!this.currentSession) {
      this.events.onError?.('No game is currently running');
      return false;
    }

    const { gameId, engine } = this.currentSession;
    const definition = this.registry.get(gameId);
    if (!definition) return false;

    const runtime = engine.getRuntime();
    const existingPlayTime = this.currentSession.lastSaveSlot
      ? (this.saveManager.load(gameId, this.currentSession.lastSaveSlot)?.playTime ?? 0)
      : 0;

    const success = this.saveManager.save(
      gameId,
      definition.meta.version,
      runtime,
      slot,
      existingPlayTime
    );

    if (success) {
      this.currentSession.lastSaveSlot = slot;
      this.events.onSave?.(gameId, slot);
    }

    return success;
  }

  /**
   * Auto-save the current game
   */
  autoSave(): boolean {
    return this.saveGame(this.saveManager.getAutoSaveSlot());
  }

  /**
   * Load a save into the current game
   */
  loadGame(slot: string = 'default'): boolean {
    if (!this.currentSession) {
      this.events.onError?.('No game is currently running');
      return false;
    }

    const { gameId, engine } = this.currentSession;
    const saveData = this.saveManager.load(gameId, slot);

    if (!saveData) {
      this.events.onError?.(`Save not found: ${slot}`);
      return false;
    }

    // Apply save data to engine
    engine.stop();

    // Reset and apply state
    const runtime = engine.getRuntime();
    Object.assign(runtime.state, saveData.state);
    (runtime as { tick: number }).tick = saveData.tick;
    (runtime as { phase: string | null }).phase = saveData.phase;
    Object.assign(runtime.completedProjects, saveData.completedProjects);
    Object.assign(runtime.ruleFires, saveData.ruleFires);

    this.currentSession.lastSaveSlot = slot;

    // Restart engine
    engine.start();

    this.events.onLoad?.(gameId, slot);

    return true;
  }

  /**
   * Get save slots for the current game
   */
  getSaveSlots(): SaveSlotInfo[] {
    if (!this.currentSession) {
      return [];
    }

    return this.saveManager.getSaveSlots(this.currentSession.gameId);
  }

  /**
   * Get save slots for any game
   */
  getSaveSlotsForGame(gameId: string): SaveSlotInfo[] {
    return this.saveManager.getSaveSlots(gameId);
  }

  /**
   * Delete a save slot
   */
  deleteSave(slot: string): boolean {
    if (!this.currentSession) {
      return false;
    }

    return this.saveManager.delete(this.currentSession.gameId, slot);
  }

  /**
   * Export current game save
   */
  exportSave(slot: string = 'default'): string | null {
    if (!this.currentSession) {
      return null;
    }

    return this.saveManager.export(this.currentSession.gameId, slot);
  }

  /**
   * Import a save
   */
  importSave(jsonString: string): boolean {
    const result = this.saveManager.import(jsonString);
    if (!result.success) {
      this.events.onError?.(result.error || 'Failed to import save');
    }
    return result.success;
  }

  // ============================================================================
  // CURRENT GAME ACCESS
  // ============================================================================

  /**
   * Get the current game session
   */
  getCurrentSession(): GameSession | null {
    return this.currentSession;
  }

  /**
   * Get the current game engine
   */
  getCurrentEngine(): GameEngine | null {
    return this.currentSession?.engine ?? null;
  }

  /**
   * Get the current game ID
   */
  getCurrentGameId(): string | null {
    return this.currentSession?.gameId ?? null;
  }

  /**
   * Check if a game is currently running
   */
  isGameRunning(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get the current game definition
   */
  getCurrentGameDefinition(): GameDefinition | null {
    if (!this.currentSession) return null;
    return this.registry.get(this.currentSession.gameId) ?? null;
  }

  // ============================================================================
  // GAME DISCOVERY
  // ============================================================================

  /**
   * Find games with existing saves
   */
  getGamesWithSaves(): GameInfo[] {
    const savedGameIds = this.saveManager.getSavedGames();
    return this.registry.list().filter(game => savedGameIds.includes(game.id));
  }

  /**
   * Search for games by name or description
   */
  searchGames(query: string): GameInfo[] {
    return this.registry.search(query);
  }

  /**
   * Get games by author
   */
  getGamesByAuthor(author: string): GameDefinition[] {
    return this.registry.findByAuthor(author);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get storage usage information
   */
  getStorageUsage(): { total: number; byGame: Record<string, number> } {
    return this.saveManager.getStorageUsage();
  }

  /**
   * Clear all data for a game
   */
  clearGameData(gameId: string): boolean {
    // Stop if currently playing
    if (this.currentSession?.gameId === gameId) {
      this.stopCurrentGame(false);
    }

    // Delete all saves
    return this.saveManager.deleteAll(gameId);
  }

  /**
   * Get play time for current session
   */
  getSessionPlayTime(): number {
    if (!this.currentSession) return 0;
    return this.saveManager.getSessionPlayTime(this.currentSession.gameId);
  }

  /**
   * Get total number of registered games
   */
  get gameCount(): number {
    return this.registry.size;
  }
}

// Global manager singleton
let globalManager: GameManager | null = null;

/**
 * Get the global game manager (creates one if it doesn't exist)
 */
export function getGlobalManager(): GameManager {
  if (!globalManager) {
    globalManager = new GameManager();
  }
  return globalManager;
}

/**
 * Reset the global manager (mainly for testing)
 */
export function resetGlobalManager(): void {
  if (globalManager?.isGameRunning()) {
    globalManager.stopCurrentGame(false);
  }
  globalManager = null;
}
