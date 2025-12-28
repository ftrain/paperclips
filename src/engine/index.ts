/**
 * Engine Module Exports
 */

export { GameEngine } from './GameEngine';
export type { GameEngineEvents } from './GameEngine';

export {
  evaluateExpression,
  evaluateCondition,
  getStateValue,
  setStateValue,
  formatValue,
  formatCompact,
  formatTime,
} from './evaluator';

export {
  executeAction,
  applyCosts,
  canAfford,
} from './actions';

export {
  GameRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from './GameRegistry';
export type { GameInfo, RegistrationResult } from './GameRegistry';

export {
  GameLoader,
  getGlobalLoader,
  resetGlobalLoader,
} from './GameLoader';
export type { LoadResult, LoadOptions } from './GameLoader';

export {
  SaveManager,
  getGlobalSaveManager,
  resetGlobalSaveManager,
} from './SaveManager';
export type { SaveData, SaveSlotInfo, SaveManagerOptions } from './SaveManager';

export {
  GameManager,
  getGlobalManager,
  resetGlobalManager,
} from './GameManager';
export type { GameManagerEvents, GameManagerConfig, GameSession } from './GameManager';
