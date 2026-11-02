// The Canvas token lives in this tab's sessionStorage, apart from the app state
// in localStorage: it goes when the tab closes and never ends up in a saved state.

const KEY = "semester-autopilot.canvas-token";

export function loadCanvasToken(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveCanvasToken(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // Storage unavailable: the token just lasts until the page reloads.
  }
}

export function clearCanvasToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
