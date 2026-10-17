/** Fullscreen and Screen Wake Lock: both optional, failures are swallowed. */

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Must run inside a user gesture. Resolves false if the browser refused. */
export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<boolean> {
  if (!document.fullscreenEnabled || isFullscreen()) return isFullscreen();
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Already left (Esc) or not allowed: nothing to undo.
  }
}

/**
 * Keeps the display from sleeping while the black screen waits, so the
 * monitor's own power saving does not give the prank away. The browser drops
 * the lock whenever the tab is hidden; it is taken again on return.
 */
export class ScreenWakeLock {
  #sentinel: WakeLockSentinel | undefined;
  #wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.#wanted && document.visibilityState === 'visible') void this.#request();
    });
  }

  async acquire(): Promise<void> {
    this.#wanted = true;
    await this.#request();
  }

  async release(): Promise<void> {
    this.#wanted = false;
    const s = this.#sentinel;
    this.#sentinel = undefined;
    try {
      await s?.release();
    } catch {
      // Already released by the browser.
    }
  }

  async #request(): Promise<void> {
    if (!('wakeLock' in navigator) || (this.#sentinel && !this.#sentinel.released)) return;
    try {
      this.#sentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed (battery saver, permissions policy): the prank still works.
    }
  }
}
