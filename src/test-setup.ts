/**
 * Vitest Setup - Polyfills for Node environment
 */

// Simple localStorage polyfill for Node
const localStorageData: Record<string, string> = {};

global.localStorage = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
  get length() { return Object.keys(localStorageData).length; },
  key: (index: number) => Object.keys(localStorageData)[index] ?? null,
} as Storage;
