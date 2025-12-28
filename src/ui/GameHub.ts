/**
 * GameHub - UI component for selecting and managing multiple games
 *
 * Provides:
 * - Game selection grid/list
 * - Save slot management per game
 * - Game search/filtering
 * - New game / continue options
 */

import type { GameDefinition } from '../types/game';
import { GameManager, getGlobalManager, GameSession } from '../engine/GameManager';
import { GameRegistry, getGlobalRegistry, GameInfo } from '../engine/GameRegistry';
import { SaveManager, getGlobalSaveManager, SaveSlotInfo } from '../engine/SaveManager';

export interface GameHubEvents {
  onGameSelected?: (gameId: string, isNewGame: boolean) => void;
  onGameStarted?: (session: GameSession) => void;
  onError?: (error: string) => void;
}

export interface GameHubOptions {
  containerId?: string;
  showSearch?: boolean;
  showSaveSlots?: boolean;
  maxGamesPerRow?: number;
}

/**
 * Game Hub UI Component
 */
export class GameHub {
  private container: HTMLElement | null = null;
  private manager: GameManager;
  private registry: GameRegistry;
  private saveManager: SaveManager;
  private events: GameHubEvents;
  private options: Required<GameHubOptions>;
  private selectedGameId: string | null = null;

  constructor(events: GameHubEvents = {}, options: GameHubOptions = {}) {
    this.manager = getGlobalManager();
    this.registry = getGlobalRegistry();
    this.saveManager = getGlobalSaveManager();
    this.events = events;
    this.options = {
      containerId: options.containerId ?? 'gameHub',
      showSearch: options.showSearch ?? true,
      showSaveSlots: options.showSaveSlots ?? true,
      maxGamesPerRow: options.maxGamesPerRow ?? 3,
    };
  }

  /**
   * Initialize the hub UI
   */
  initialize(container?: HTMLElement): boolean {
    this.container = container ?? document.getElementById(this.options.containerId);

    if (!this.container) {
      this.events.onError?.(`Container not found: ${this.options.containerId}`);
      return false;
    }

    this.render();
    return true;
  }

  /**
   * Render the complete hub UI
   */
  render(): void {
    if (!this.container) return;

    const games = this.registry.list();

    this.container.innerHTML = `
      <div class="game-hub" data-testid="game-hub">
        <header class="hub-header">
          <h1>Game Hub</h1>
          ${this.options.showSearch ? this.renderSearch() : ''}
        </header>

        <main class="hub-content">
          ${games.length === 0 ? this.renderEmptyState() : this.renderGameGrid(games)}
        </main>

        <div class="hub-modal" id="saveSlotModal" style="display: none;">
          ${this.renderSaveSlotModal()}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render search bar
   */
  private renderSearch(): string {
    return `
      <div class="hub-search">
        <input
          type="text"
          id="gameSearchInput"
          placeholder="Search games..."
          data-testid="game-search"
        />
      </div>
    `;
  }

  /**
   * Render empty state when no games
   */
  private renderEmptyState(): string {
    return `
      <div class="hub-empty" data-testid="hub-empty">
        <p>No games available</p>
        <p class="hub-empty-hint">Register games using the GameManager API</p>
      </div>
    `;
  }

  /**
   * Render the game selection grid
   */
  private renderGameGrid(games: GameInfo[]): string {
    return `
      <div class="game-grid" data-testid="game-grid">
        ${games.map(game => this.renderGameCard(game)).join('')}
      </div>
    `;
  }

  /**
   * Render a single game card
   */
  private renderGameCard(game: GameInfo): string {
    const hasSaves = this.saveManager.getSaveSlots(game.id).length > 0;
    const hasAutoSave = this.saveManager.hasAutoSave(game.id);

    return `
      <div class="game-card" data-game-id="${game.id}" data-testid="game-card-${game.id}">
        <div class="game-card-header">
          <h3 class="game-card-title">${this.escapeHtml(game.name)}</h3>
          <span class="game-card-version">v${this.escapeHtml(game.version)}</span>
        </div>

        ${game.description ? `<p class="game-card-description">${this.escapeHtml(game.description)}</p>` : ''}

        ${game.author ? `<p class="game-card-author">by ${this.escapeHtml(game.author)}</p>` : ''}

        <div class="game-card-actions">
          <button
            class="btn btn-primary game-play-btn"
            data-action="play"
            data-game-id="${game.id}"
            data-testid="play-${game.id}"
          >
            ${hasAutoSave ? 'Continue' : 'New Game'}
          </button>

          ${hasSaves ? `
            <button
              class="btn btn-secondary game-saves-btn"
              data-action="saves"
              data-game-id="${game.id}"
              data-testid="saves-${game.id}"
            >
              Load Save
            </button>
          ` : ''}
        </div>

        ${hasSaves ? `<span class="game-card-save-indicator" data-testid="save-indicator-${game.id}">💾</span>` : ''}
      </div>
    `;
  }

  /**
   * Render save slot modal
   */
  private renderSaveSlotModal(): string {
    return `
      <div class="modal-overlay" data-action="closeModal"></div>
      <div class="modal-content" data-testid="save-modal">
        <div class="modal-header">
          <h2 id="saveModalTitle">Load Save</h2>
          <button class="modal-close" data-action="closeModal" data-testid="close-modal">&times;</button>
        </div>
        <div class="modal-body" id="saveSlotList">
          <!-- Save slots will be rendered here -->
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
          <button class="btn btn-primary" data-action="newGame" data-testid="new-game-btn">New Game</button>
        </div>
      </div>
    `;
  }

  /**
   * Render save slots for a game
   */
  private renderSaveSlots(gameId: string): string {
    const slots = this.saveManager.getSaveSlots(gameId);

    if (slots.length === 0) {
      return '<p class="no-saves">No saves found</p>';
    }

    return `
      <ul class="save-slot-list" data-testid="save-slot-list">
        ${slots.map(slot => this.renderSaveSlot(slot)).join('')}
      </ul>
    `;
  }

  /**
   * Render a single save slot
   */
  private renderSaveSlot(slot: SaveSlotInfo): string {
    if (!slot.exists) return '';

    const date = slot.timestamp ? new Date(slot.timestamp).toLocaleString() : 'Unknown';
    const playTime = slot.playTime ? this.formatPlayTime(slot.playTime) : '';

    return `
      <li class="save-slot" data-slot="${slot.slot}" data-testid="save-slot-${slot.slot}">
        <div class="save-slot-info">
          <span class="save-slot-name">${this.escapeHtml(slot.slot)}</span>
          <span class="save-slot-date">${date}</span>
          ${playTime ? `<span class="save-slot-playtime">${playTime}</span>` : ''}
        </div>
        <div class="save-slot-actions">
          <button
            class="btn btn-small btn-primary"
            data-action="loadSlot"
            data-slot="${slot.slot}"
            data-testid="load-slot-${slot.slot}"
          >
            Load
          </button>
          <button
            class="btn btn-small btn-danger"
            data-action="deleteSlot"
            data-slot="${slot.slot}"
            data-testid="delete-slot-${slot.slot}"
          >
            Delete
          </button>
        </div>
      </li>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.container) return;

    // Delegate all clicks
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      if (!action) return;

      switch (action) {
        case 'play':
          this.handlePlayGame(target.dataset.gameId!);
          break;
        case 'saves':
          this.handleShowSaves(target.dataset.gameId!);
          break;
        case 'closeModal':
          this.hideModal();
          break;
        case 'newGame':
          this.handleNewGame();
          break;
        case 'loadSlot':
          this.handleLoadSlot(target.dataset.slot!);
          break;
        case 'deleteSlot':
          this.handleDeleteSlot(target.dataset.slot!);
          break;
      }
    });

    // Search input
    const searchInput = this.container.querySelector('#gameSearchInput') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch((e.target as HTMLInputElement).value);
      });
    }
  }

  /**
   * Handle play button click
   */
  private handlePlayGame(gameId: string): void {
    this.selectedGameId = gameId;

    // Check for autosave
    const hasAutoSave = this.saveManager.hasAutoSave(gameId);

    if (hasAutoSave) {
      // Continue from autosave
      this.startGame(gameId, this.saveManager.getAutoSaveSlot());
    } else {
      // Start new game
      this.startGame(gameId);
    }
  }

  /**
   * Handle show saves button
   */
  private handleShowSaves(gameId: string): void {
    this.selectedGameId = gameId;
    this.showModal(gameId);
  }

  /**
   * Handle new game button in modal
   */
  private handleNewGame(): void {
    if (this.selectedGameId) {
      this.hideModal();
      this.startGame(this.selectedGameId);
    }
  }

  /**
   * Handle load slot button
   */
  private handleLoadSlot(slot: string): void {
    if (this.selectedGameId) {
      this.hideModal();
      this.startGame(this.selectedGameId, slot);
    }
  }

  /**
   * Handle delete slot button
   */
  private handleDeleteSlot(slot: string): void {
    if (this.selectedGameId && confirm(`Delete save "${slot}"?`)) {
      this.saveManager.delete(this.selectedGameId, slot);
      this.updateSaveSlotList();
    }
  }

  /**
   * Handle search input
   */
  private handleSearch(query: string): void {
    const games = query.trim()
      ? this.registry.search(query)
      : this.registry.list();

    const gridContainer = this.container?.querySelector('.hub-content');
    if (gridContainer) {
      gridContainer.innerHTML = games.length === 0
        ? this.renderEmptyState()
        : this.renderGameGrid(games);
    }
  }

  /**
   * Start a game
   */
  private startGame(gameId: string, slot?: string): void {
    const success = this.manager.startGame(gameId, slot);

    if (success) {
      const session = this.manager.getCurrentSession();
      this.events.onGameStarted?.(session!);
      this.events.onGameSelected?.(gameId, !slot);
    } else {
      this.events.onError?.(`Failed to start game: ${gameId}`);
    }
  }

  /**
   * Show save slot modal
   */
  private showModal(gameId: string): void {
    const modal = this.container?.querySelector('#saveSlotModal') as HTMLElement;
    const title = this.container?.querySelector('#saveModalTitle') as HTMLElement;
    const list = this.container?.querySelector('#saveSlotList') as HTMLElement;

    if (modal && title && list) {
      const game = this.registry.get(gameId);
      title.textContent = game ? `${game.meta.name} - Load Save` : 'Load Save';
      list.innerHTML = this.renderSaveSlots(gameId);
      modal.style.display = 'flex';
    }
  }

  /**
   * Hide save slot modal
   */
  private hideModal(): void {
    const modal = this.container?.querySelector('#saveSlotModal') as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Update save slot list in modal
   */
  private updateSaveSlotList(): void {
    if (this.selectedGameId) {
      const list = this.container?.querySelector('#saveSlotList') as HTMLElement;
      if (list) {
        list.innerHTML = this.renderSaveSlots(this.selectedGameId);
      }
    }
  }

  /**
   * Format play time in human-readable format
   */
  private formatPlayTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Refresh the hub display
   */
  refresh(): void {
    this.render();
  }

  /**
   * Get the container element
   */
  getContainer(): HTMLElement | null {
    return this.container;
  }

  /**
   * Check if hub is initialized
   */
  isInitialized(): boolean {
    return this.container !== null;
  }
}

// Export factory function
export function createGameHub(
  events: GameHubEvents = {},
  options: GameHubOptions = {}
): GameHub {
  return new GameHub(events, options);
}
