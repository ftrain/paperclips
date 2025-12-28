/**
 * GameRegistry - Manages multiple game definitions
 *
 * Provides:
 * - Registration of game definitions
 * - Lookup by game ID
 * - Listing available games
 * - Metadata for game selection UI
 */

import type { GameDefinition } from '../types/game';
import { validateGameDefinition, formatValidationErrors } from '../types/schemas';

/**
 * Summary information about a registered game
 */
export interface GameInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
}

/**
 * Result of attempting to register a game
 */
export interface RegistrationResult {
  success: boolean;
  gameId?: string;
  errors?: string[];
}

/**
 * Registry for managing multiple game definitions
 */
export class GameRegistry {
  private games: Map<string, GameDefinition> = new Map();
  private defaultGameId: string | null = null;

  /**
   * Register a game definition
   * @param definition - The game definition to register
   * @param options - Registration options
   * @returns Registration result with success status and any errors
   */
  register(
    definition: GameDefinition,
    options: { validate?: boolean; setAsDefault?: boolean } = {}
  ): RegistrationResult {
    const { validate = true, setAsDefault = false } = options;

    // Validate if requested
    if (validate) {
      const result = validateGameDefinition(definition);
      if (!result.success) {
        return {
          success: false,
          errors: result.errors ? formatValidationErrors(result.errors) : ['Invalid game definition'],
        };
      }
    }

    const gameId = definition.meta.id;

    // Check for duplicate
    if (this.games.has(gameId)) {
      const existing = this.games.get(gameId)!;
      console.warn(
        `Replacing existing game "${gameId}" (v${existing.meta.version}) with v${definition.meta.version}`
      );
    }

    this.games.set(gameId, definition);

    // Set as default if requested or if it's the first game
    if (setAsDefault || this.games.size === 1) {
      this.defaultGameId = gameId;
    }

    return {
      success: true,
      gameId,
    };
  }

  /**
   * Register multiple games at once
   */
  registerAll(
    definitions: GameDefinition[],
    options: { validate?: boolean } = {}
  ): RegistrationResult[] {
    return definitions.map((def, index) =>
      this.register(def, {
        ...options,
        setAsDefault: index === 0 && !this.defaultGameId,
      })
    );
  }

  /**
   * Unregister a game by ID
   */
  unregister(gameId: string): boolean {
    const removed = this.games.delete(gameId);

    if (removed && this.defaultGameId === gameId) {
      // Pick a new default if available
      const firstGame = this.games.keys().next();
      this.defaultGameId = firstGame.done ? null : firstGame.value;
    }

    return removed;
  }

  /**
   * Get a game definition by ID
   */
  get(gameId: string): GameDefinition | undefined {
    return this.games.get(gameId);
  }

  /**
   * Get the default game definition
   */
  getDefault(): GameDefinition | undefined {
    if (!this.defaultGameId) return undefined;
    return this.games.get(this.defaultGameId);
  }

  /**
   * Set the default game
   */
  setDefault(gameId: string): boolean {
    if (!this.games.has(gameId)) {
      return false;
    }
    this.defaultGameId = gameId;
    return true;
  }

  /**
   * Get the default game ID
   */
  getDefaultId(): string | null {
    return this.defaultGameId;
  }

  /**
   * Check if a game is registered
   */
  has(gameId: string): boolean {
    return this.games.has(gameId);
  }

  /**
   * Get list of all registered game IDs
   */
  getIds(): string[] {
    return Array.from(this.games.keys());
  }

  /**
   * Get summary info for all registered games
   */
  list(): GameInfo[] {
    return Array.from(this.games.values()).map((game) => ({
      id: game.meta.id,
      name: game.meta.name,
      version: game.meta.version,
      description: game.meta.description,
      author: game.meta.author,
    }));
  }

  /**
   * Get summary info for a specific game
   */
  getInfo(gameId: string): GameInfo | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;

    return {
      id: game.meta.id,
      name: game.meta.name,
      version: game.meta.version,
      description: game.meta.description,
      author: game.meta.author,
    };
  }

  /**
   * Get the number of registered games
   */
  get size(): number {
    return this.games.size;
  }

  /**
   * Clear all registered games
   */
  clear(): void {
    this.games.clear();
    this.defaultGameId = null;
  }

  /**
   * Find games matching a filter
   */
  find(predicate: (game: GameDefinition) => boolean): GameDefinition[] {
    return Array.from(this.games.values()).filter(predicate);
  }

  /**
   * Find games by author
   */
  findByAuthor(author: string): GameDefinition[] {
    return this.find(
      (game) => game.meta.author?.toLowerCase() === author.toLowerCase()
    );
  }

  /**
   * Search games by name or description
   */
  search(query: string): GameInfo[] {
    const lowerQuery = query.toLowerCase();
    return this.list().filter(
      (info) =>
        info.name.toLowerCase().includes(lowerQuery) ||
        info.description?.toLowerCase().includes(lowerQuery)
    );
  }
}

// Global registry singleton
let globalRegistry: GameRegistry | null = null;

/**
 * Get the global game registry (creates one if it doesn't exist)
 */
export function getGlobalRegistry(): GameRegistry {
  if (!globalRegistry) {
    globalRegistry = new GameRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (mainly for testing)
 */
export function resetGlobalRegistry(): void {
  globalRegistry = null;
}
