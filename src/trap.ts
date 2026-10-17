/**
 * The trap: a small state machine with no DOM access, so it can be unit-tested
 * with fake timers.
 *
 *   idle ──start()──▶ arming ──(input stays quiet for armDelayMs)──▶ armed ──(any input)──▶ triggered
 *                       │                                                ▲
 *                       └──fullscreen exited──▶ idle (cancelled)          │
 *                       └──any input restarts the quiet period            │
 *
 * Arming waits for the prankster's own hand to leave the mouse: the screen goes
 * black at once, but the trap only listens once everything has been still for
 * `armDelayMs`. In the armed phase a small pointer jitter (an optical mouse on a
 * shaky desk) is ignored until it adds up to `moveThresholdPx` within one burst.
 */

export type Phase = 'idle' | 'arming' | 'armed' | 'triggered';

export type TriggerReason = 'pointer-move' | 'pointer-down' | 'wheel' | 'key' | 'touch' | 'fullscreen-exit';

export interface TrapOptions {
  readonly armDelayMs: number;
  readonly moveThresholdPx: number;
  readonly onTrigger: (reason: TriggerReason) => void;
  readonly onArmed?: () => void;
  readonly onCancel?: () => void;
  /** Monotonic clock in ms; injectable for tests. */
  readonly now?: () => number;
}

/** Pointer travel resets when the pointer rests longer than this between moves. */
export const MOVE_BURST_GAP_MS = 400;

export class Trap {
  #phase: Phase = 'idle';
  #timer: ReturnType<typeof setTimeout> | undefined;
  #travel = 0;
  #lastMoveAt = Number.NEGATIVE_INFINITY;
  readonly #opts: TrapOptions;
  readonly #now: () => number;

  constructor(opts: TrapOptions) {
    this.#opts = opts;
    this.#now = opts.now ?? (() => performance.now());
  }

  get phase(): Phase {
    return this.#phase;
  }

  start(): void {
    if (this.#phase !== 'idle') return;
    this.#phase = 'arming';
    this.#scheduleArm();
  }

  reset(): void {
    this.#clearTimer();
    this.#phase = 'idle';
    this.#travel = 0;
    this.#lastMoveAt = Number.NEGATIVE_INFINITY;
  }

  pointerMove(dx: number, dy: number): void {
    if (this.#phase === 'arming') {
      this.#scheduleArm();
      return;
    }
    if (this.#phase !== 'armed') return;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance === 0) return;
    const now = this.#now();
    if (now - this.#lastMoveAt > MOVE_BURST_GAP_MS) this.#travel = 0;
    this.#lastMoveAt = now;
    this.#travel += distance;
    if (this.#travel >= this.#opts.moveThresholdPx) this.#trigger('pointer-move');
  }

  pointerDown(): void {
    this.#input('pointer-down');
  }

  wheel(): void {
    this.#input('wheel');
  }

  key(): void {
    this.#input('key');
  }

  touch(): void {
    this.#input('touch');
  }

  fullscreenExited(): void {
    if (this.#phase === 'arming') {
      // The prankster changed their mind (Esc) before walking away.
      this.reset();
      this.#opts.onCancel?.();
      return;
    }
    if (this.#phase === 'armed') this.#trigger('fullscreen-exit');
  }

  #input(reason: TriggerReason): void {
    if (this.#phase === 'arming') this.#scheduleArm();
    else if (this.#phase === 'armed') this.#trigger(reason);
  }

  #scheduleArm(): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (this.#phase !== 'arming') return;
      this.#phase = 'armed';
      this.#travel = 0;
      this.#lastMoveAt = Number.NEGATIVE_INFINITY;
      this.#opts.onArmed?.();
    }, this.#opts.armDelayMs);
  }

  #trigger(reason: TriggerReason): void {
    this.#clearTimer();
    this.#phase = 'triggered';
    this.#opts.onTrigger(reason);
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
