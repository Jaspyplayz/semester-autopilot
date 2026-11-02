// Browser state: an external store for useSyncExternalStore, saved through a
// StateRepository. Syllabus text and deadlines stay on this device.

import { clearCanvasToken } from "./canvas-session";
import { defaultState, reviveState, type AppState, type StateRepository } from "./state";

const KEY = "semester-autopilot.v1";

const localStorageRepository: StateRepository = {
  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? reviveState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  },
};

const repository = localStorageRepository;
const listeners = new Set<() => void>();
let current: AppState | null = null;
let saveFailed = false;

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AppState {
  current ??= repository.load() ?? defaultState();
  return current;
}

/** Nothing to show while prerendering; the browser fills in the real state. */
export function getServerSnapshot(): null {
  return null;
}

export function update(change: (state: AppState) => AppState): void {
  current = change(getSnapshot());
  saveFailed = !repository.save(current);
  emit();
}

export function resetAll(): void {
  repository.clear();
  clearCanvasToken();
  current = defaultState();
  saveFailed = false;
  emit();
}

export function lastSaveFailed(): boolean {
  return saveFailed;
}
