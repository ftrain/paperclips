/**
 * SaveManager - Game-specific save/load functionality
 *
 * Provides:
 * - Game-specific save slots
 * - Multiple save slots per game
 * - Save metadata (timestamps, version, etc.)
 * - Import/export save data
 * - Cloud save support hooks
 */

import type { GameState, RuntimeState } from '../types/game';

/**
 * Save data structure
 */
export interface SaveData {
  gameId: string;
  gameVersion: string;
  slot: string;
  state: GameState;
  tick: number;
  phase: string | null;
  completedProjects: Record<string, number>;
  ruleFires: Record<string, { count: number; lastTick: number }>;
  timestamp: number;
  playTime: number;  // Total play time in ms
  saveVersion: number;  // For migration support
}

/**
 * Save slot info for UI display
 */
export interface SaveSlotInfo {
  gameId: string;
  slot: string;
  exists: boolean;
  timestamp?: number;
  playTime?: number;
  gameVersion?: string;
}

/**
 * Options for SaveManager
 */
export interface SaveManagerOptions {
  storagePrefix?: string;
  maxSlotsPerGame?: number;
  autoSaveSlot?: string;
}

const CURRENT_SAVE_VERSION = 1;

/**
 * Manages save/load operations for multiple games
 */
export class SaveManager {
  private storagePrefix: string;
  private maxSlotsPerGame: number;
  private autoSaveSlot: string;
  private playTimeStart: Map<string, number> = new Map();  // gameId -> start time

  constructor(options: SaveManagerOptions = {}) {
    this.storagePrefix = options.storagePrefix ?? 'paperclips';
    this.maxSlotsPerGame = options.maxSlotsPerGame ?? 10;
    this.autoSaveSlot = options.autoSaveSlot ?? 'autosave';
  }

  /**
   * Generate storage key for a save
   */
  private getStorageKey(gameId: string, slot: string): string {
    return `${this.storagePrefix}_${gameId}_${slot}`;
  }

  /**
   * Generate index key for a game's save list
   */
  private getIndexKey(gameId: string): string {
    return `${this.storagePrefix}_${gameId}_index`;
  }

  /**
   * Start tracking play time for a game
   */
  startPlayTime(gameId: string): void {
    this.playTimeStart.set(gameId, Date.now());
  }

  /**
   * Get accumulated play time since start (in ms)
   */
  getSessionPlayTime(gameId: string): number {
    const start = this.playTimeStart.get(gameId);
    return start ? Date.now() - start : 0;
  }

  /**
   * Save game state to a slot
   */
  save(
    gameId: string,
    gameVersion: string,
    runtime: RuntimeState,
    slot: string = 'default',
    existingPlayTime: number = 0
  ): boolean {
    try {
      const saveData: SaveData = {
        gameId,
        gameVersion,
        slot,
        state: runtime.state,
        tick: runtime.tick,
        phase: runtime.phase,
        completedProjects: runtime.completedProjects,
        ruleFires: runtime.ruleFires,
        timestamp: Date.now(),
        playTime: existingPlayTime + this.getSessionPlayTime(gameId),
        saveVersion: CURRENT_SAVE_VERSION,
      };

      const key = this.getStorageKey(gameId, slot);
      localStorage.setItem(key, JSON.stringify(saveData));

      // Update save index
      this.updateSaveIndex(gameId, slot);

      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  /**
   * Load game state from a slot
   */
  load(gameId: string, slot: string = 'default'): SaveData | null {
    try {
      const key = this.getStorageKey(gameId, slot);
      const data = localStorage.getItem(key);

      if (!data) return null;

      const saveData = JSON.parse(data) as SaveData;

      // Verify game ID matches
      if (saveData.gameId !== gameId) {
        console.warn(`Save game ID mismatch: expected ${gameId}, got ${saveData.gameId}`);
        return null;
      }

      // Migrate if needed
      return this.migrateSaveData(saveData);
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }

  /**
   * Migrate save data to current version
   */
  private migrateSaveData(saveData: SaveData): SaveData {
    // Currently at version 1, no migrations needed
    // Future migrations would go here
    return saveData;
  }

  /**
   * Delete a save slot
   */
  delete(gameId: string, slot: string): boolean {
    try {
      const key = this.getStorageKey(gameId, slot);
      localStorage.removeItem(key);

      // Update index
      this.removeSaveFromIndex(gameId, slot);

      return true;
    } catch (error) {
      console.error('Failed to delete save:', error);
      return false;
    }
  }

  /**
   * Delete all saves for a game
   */
  deleteAll(gameId: string): boolean {
    try {
      const slots = this.getSaveSlots(gameId);
      for (const info of slots) {
        if (info.exists) {
          const key = this.getStorageKey(gameId, info.slot);
          localStorage.removeItem(key);
        }
      }

      // Clear index
      localStorage.removeItem(this.getIndexKey(gameId));

      return true;
    } catch (error) {
      console.error('Failed to delete all saves:', error);
      return false;
    }
  }

  /**
   * Check if a save exists
   */
  exists(gameId: string, slot: string = 'default'): boolean {
    const key = this.getStorageKey(gameId, slot);
    return localStorage.getItem(key) !== null;
  }

  /**
   * Get all save slots for a game
   */
  getSaveSlots(gameId: string): SaveSlotInfo[] {
    const indexKey = this.getIndexKey(gameId);
    const indexData = localStorage.getItem(indexKey);
    const slots: string[] = indexData ? JSON.parse(indexData) : [];

    return slots.map(slot => {
      const saveData = this.load(gameId, slot);
      return {
        gameId,
        slot,
        exists: saveData !== null,
        timestamp: saveData?.timestamp,
        playTime: saveData?.playTime,
        gameVersion: saveData?.gameVersion,
      };
    });
  }

  /**
   * Update the save index for a game
   */
  private updateSaveIndex(gameId: string, slot: string): void {
    const indexKey = this.getIndexKey(gameId);
    const indexData = localStorage.getItem(indexKey);
    const slots: string[] = indexData ? JSON.parse(indexData) : [];

    if (!slots.includes(slot)) {
      slots.push(slot);

      // Enforce max slots (remove oldest non-autosave)
      if (slots.length > this.maxSlotsPerGame) {
        const oldestNonAuto = slots.find(s => s !== this.autoSaveSlot);
        if (oldestNonAuto) {
          this.delete(gameId, oldestNonAuto);
        }
      }

      localStorage.setItem(indexKey, JSON.stringify(slots));
    }
  }

  /**
   * Remove a slot from the save index
   */
  private removeSaveFromIndex(gameId: string, slot: string): void {
    const indexKey = this.getIndexKey(gameId);
    const indexData = localStorage.getItem(indexKey);
    const slots: string[] = indexData ? JSON.parse(indexData) : [];

    const index = slots.indexOf(slot);
    if (index >= 0) {
      slots.splice(index, 1);
      localStorage.setItem(indexKey, JSON.stringify(slots));
    }
  }

  /**
   * Export save data as a JSON string (for backup/sharing)
   */
  export(gameId: string, slot: string = 'default'): string | null {
    const saveData = this.load(gameId, slot);
    if (!saveData) return null;

    return JSON.stringify(saveData, null, 2);
  }

  /**
   * Export all saves for a game
   */
  exportAll(gameId: string): string | null {
    const slots = this.getSaveSlots(gameId);
    const saves: SaveData[] = [];

    for (const info of slots) {
      if (info.exists) {
        const saveData = this.load(gameId, info.slot);
        if (saveData) {
          saves.push(saveData);
        }
      }
    }

    if (saves.length === 0) return null;

    return JSON.stringify({ gameId, saves }, null, 2);
  }

  /**
   * Import save data from a JSON string
   */
  import(jsonString: string): { success: boolean; slot?: string; error?: string } {
    try {
      const saveData = JSON.parse(jsonString) as SaveData;

      // Validate required fields
      if (!saveData.gameId || !saveData.state || !saveData.slot) {
        return { success: false, error: 'Invalid save data format' };
      }

      const key = this.getStorageKey(saveData.gameId, saveData.slot);
      localStorage.setItem(key, JSON.stringify(saveData));
      this.updateSaveIndex(saveData.gameId, saveData.slot);

      return { success: true, slot: saveData.slot };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get total storage used by saves (in bytes, approximate)
   */
  getStorageUsage(): { total: number; byGame: Record<string, number> } {
    const byGame: Record<string, number> = {};
    let total = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.storagePrefix)) {
        const value = localStorage.getItem(key) || '';
        const size = key.length + value.length;
        total += size;

        // Extract game ID from key
        const match = key.match(new RegExp(`^${this.storagePrefix}_([^_]+)_`));
        if (match) {
          const gameId = match[1];
          byGame[gameId] = (byGame[gameId] || 0) + size;
        }
      }
    }

    return { total, byGame };
  }

  /**
   * Get the autosave slot name
   */
  getAutoSaveSlot(): string {
    return this.autoSaveSlot;
  }

  /**
   * Check if there's an autosave for a game
   */
  hasAutoSave(gameId: string): boolean {
    return this.exists(gameId, this.autoSaveSlot);
  }

  /**
   * Get list of all games that have saves
   */
  getSavedGames(): string[] {
    const games = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.storagePrefix) && key.endsWith('_index')) {
        const match = key.match(new RegExp(`^${this.storagePrefix}_([^_]+)_index$`));
        if (match) {
          games.add(match[1]);
        }
      }
    }

    return Array.from(games);
  }
}

// Global save manager singleton
let globalSaveManager: SaveManager | null = null;

/**
 * Get the global save manager (creates one if it doesn't exist)
 */
export function getGlobalSaveManager(): SaveManager {
  if (!globalSaveManager) {
    globalSaveManager = new SaveManager();
  }
  return globalSaveManager;
}

/**
 * Reset the global save manager (mainly for testing)
 */
export function resetGlobalSaveManager(): void {
  globalSaveManager = null;
}
