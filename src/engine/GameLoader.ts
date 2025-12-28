/**
 * GameLoader - Load game definitions from various sources
 *
 * Provides:
 * - Loading from JSON files (local)
 * - Loading from URLs (remote)
 * - Loading from raw JSON objects
 * - Validation during load
 * - Caching of loaded games
 */

import type { GameDefinition } from '../types/game';
import { validateGameDefinition, formatValidationErrors } from '../types/schemas';

/**
 * Result of a load operation
 */
export interface LoadResult {
  success: boolean;
  game?: GameDefinition;
  source?: string;
  errors?: string[];
}

/**
 * Options for loading games
 */
export interface LoadOptions {
  validate?: boolean;  // Whether to validate the game (default: true)
  cache?: boolean;     // Whether to cache the loaded game (default: true)
  timeout?: number;    // Timeout for remote loads in ms (default: 10000)
}

/**
 * Cache entry for loaded games
 */
interface CacheEntry {
  game: GameDefinition;
  source: string;
  loadedAt: number;
}

/**
 * Loader for game definitions from various sources
 */
export class GameLoader {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultOptions: LoadOptions = {
    validate: true,
    cache: true,
    timeout: 10000,
  };

  constructor(options: Partial<LoadOptions> = {}) {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Load a game from a JSON object
   */
  loadFromObject(
    json: unknown,
    options: LoadOptions = {}
  ): LoadResult {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Validate if requested
      if (opts.validate) {
        const result = validateGameDefinition(json);
        if (!result.success) {
          return {
            success: false,
            errors: result.errors ? formatValidationErrors(result.errors) : ['Invalid game definition'],
          };
        }
      }

      const game = json as GameDefinition;
      const source = `object:${game.meta.id}`;

      // Cache if requested
      if (opts.cache) {
        this.cache.set(game.meta.id, {
          game,
          source,
          loadedAt: Date.now(),
        });
      }

      return {
        success: true,
        game,
        source,
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse game: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Load a game from a JSON string
   */
  loadFromString(
    jsonString: string,
    options: LoadOptions = {}
  ): LoadResult {
    try {
      const json = JSON.parse(jsonString);
      return this.loadFromObject(json, options);
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Load a game from a URL (remote)
   */
  async loadFromUrl(
    url: string,
    options: LoadOptions = {}
  ): Promise<LoadResult> {
    const opts = { ...this.defaultOptions, ...options };

    // Check cache first
    const cacheKey = `url:${url}`;
    if (opts.cache) {
      const cached = this.getCachedBySource(cacheKey);
      if (cached) {
        return {
          success: true,
          game: cached,
          source: cacheKey,
        };
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          source: cacheKey,
          errors: [`HTTP ${response.status}: ${response.statusText}`],
        };
      }

      const json = await response.json();
      const result = this.loadFromObject(json, { ...opts, cache: false });

      if (result.success && result.game && opts.cache) {
        this.cache.set(result.game.meta.id, {
          game: result.game,
          source: cacheKey,
          loadedAt: Date.now(),
        });
      }

      return {
        ...result,
        source: cacheKey,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          source: cacheKey,
          errors: [`Request timeout after ${opts.timeout}ms`],
        };
      }

      return {
        success: false,
        source: cacheKey,
        errors: [`Failed to fetch: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Load a game from a local file path (Node.js environment)
   * Note: This uses dynamic import for fs module compatibility
   */
  async loadFromFile(
    filePath: string,
    options: LoadOptions = {}
  ): Promise<LoadResult> {
    const opts = { ...this.defaultOptions, ...options };
    const cacheKey = `file:${filePath}`;

    // Check cache first
    if (opts.cache) {
      const cached = this.getCachedBySource(cacheKey);
      if (cached) {
        return {
          success: true,
          game: cached,
          source: cacheKey,
        };
      }
    }

    try {
      // Dynamic import for Node.js fs module
      const fs = await import('fs').then(m => m.promises);
      const content = await fs.readFile(filePath, 'utf-8');
      const result = this.loadFromString(content, { ...opts, cache: false });

      if (result.success && result.game && opts.cache) {
        this.cache.set(result.game.meta.id, {
          game: result.game,
          source: cacheKey,
          loadedAt: Date.now(),
        });
      }

      return {
        ...result,
        source: cacheKey,
      };
    } catch (error) {
      return {
        success: false,
        source: cacheKey,
        errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Load multiple games from an array of objects
   */
  loadAll(
    games: unknown[],
    options: LoadOptions = {}
  ): LoadResult[] {
    return games.map(game => this.loadFromObject(game, options));
  }

  /**
   * Load multiple games from URLs
   */
  async loadAllFromUrls(
    urls: string[],
    options: LoadOptions = {}
  ): Promise<LoadResult[]> {
    return Promise.all(urls.map(url => this.loadFromUrl(url, options)));
  }

  /**
   * Get a cached game by ID
   */
  getCached(gameId: string): GameDefinition | undefined {
    return this.cache.get(gameId)?.game;
  }

  /**
   * Get a cached game by source
   */
  private getCachedBySource(source: string): GameDefinition | undefined {
    for (const entry of this.cache.values()) {
      if (entry.source === source) {
        return entry.game;
      }
    }
    return undefined;
  }

  /**
   * Get all cached games
   */
  getCachedGames(): GameDefinition[] {
    return Array.from(this.cache.values()).map(entry => entry.game);
  }

  /**
   * Get cache info
   */
  getCacheInfo(): { id: string; source: string; loadedAt: number }[] {
    return Array.from(this.cache.entries()).map(([id, entry]) => ({
      id,
      source: entry.source,
      loadedAt: entry.loadedAt,
    }));
  }

  /**
   * Clear a specific game from cache
   */
  clearCache(gameId?: string): void {
    if (gameId) {
      this.cache.delete(gameId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Check if a game is cached
   */
  isCached(gameId: string): boolean {
    return this.cache.has(gameId);
  }

  /**
   * Get cache size
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}

// Global loader singleton
let globalLoader: GameLoader | null = null;

/**
 * Get the global game loader (creates one if it doesn't exist)
 */
export function getGlobalLoader(): GameLoader {
  if (!globalLoader) {
    globalLoader = new GameLoader();
  }
  return globalLoader;
}

/**
 * Reset the global loader (mainly for testing)
 */
export function resetGlobalLoader(): void {
  globalLoader = null;
}
