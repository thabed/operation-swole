/**
 * storage.js
 * Handles all persistent state for Operation Swole.
 * Uses window.storage (Claude artifact key-value API) when available,
 * with a localStorage fallback for standalone/local use.
 */

const STORAGE_KEY = 'gym-state';

const SETTINGS_DEFAULTS = {
  availableDays:         [1, 2, 4, 5, 6], // Mon, Tue, Thu, Fri, Sat (getDay values)
  hiitDay:               3,               // Wednesday
  sessionDurationTarget: 60,              // minutes
  pplRotationNext:       'push',
  weeksHighVolume:       0,
};

export let state = {
  workouts: [],
  sessions: [],
  prs:      {},
  plan:     null,
  settings: { ...SETTINGS_DEFAULTS },
};

async function storageGet(key) {
  if (window.storage) {
    const r = await window.storage.get(key);
    return r ? r.value : null;
  }
  return localStorage.getItem(key);
}

async function storageSet(key, value) {
  if (window.storage) {
    await window.storage.set(key, value);
  } else {
    localStorage.setItem(key, value);
  }
}

export async function loadState() {
  try {
    const raw = await storageGet(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      // Forward-compatible: merge any missing settings keys
      if (!state.settings) {
        state.settings = { ...SETTINGS_DEFAULTS };
      } else {
        for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) {
          if (state.settings[k] === undefined) state.settings[k] = v;
        }
      }
      if (state.plan === undefined) state.plan = null;
    }
  } catch (e) {
    console.warn('No saved state found, starting fresh.');
  }
}

export async function saveState() {
  try {
    await storageSet(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}
