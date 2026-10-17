import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_BURST_GAP_MS, Trap, type TriggerReason } from '../../src/trap';

describe('Trap', () => {
  let clock = 0;
  let triggers: TriggerReason[];
  let armed: number;
  let cancelled: number;

  const make = (armDelayMs = 1000, moveThresholdPx = 10): Trap =>
    new Trap({
      armDelayMs,
      moveThresholdPx,
      now: () => clock,
      onTrigger: (r) => triggers.push(r),
      onArmed: () => {
        armed += 1;
      },
      onCancel: () => {
        cancelled += 1;
      },
    });

  const advance = (ms: number): void => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    triggers = [];
    armed = 0;
    cancelled = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores input before start()', () => {
    const trap = make();
    trap.key();
    trap.pointerMove(100, 100);
    expect(trap.phase).toBe('idle');
    expect(triggers).toEqual([]);
  });

  it('arms after the quiet period', () => {
    const trap = make(1000);
    trap.start();
    expect(trap.phase).toBe('arming');
    advance(999);
    expect(trap.phase).toBe('arming');
    advance(1);
    expect(trap.phase).toBe('armed');
    expect(armed).toBe(1);
  });

  it('restarts the quiet period on any input while arming, without triggering', () => {
    const trap = make(1000);
    trap.start();
    advance(800);
    trap.pointerMove(50, 0);
    advance(800);
    trap.key();
    advance(800);
    trap.pointerDown();
    advance(999);
    expect(trap.phase).toBe('arming');
    advance(1);
    expect(trap.phase).toBe('armed');
    expect(triggers).toEqual([]);
  });

  it.each([
    [
      'key',
      (t: Trap) => {
        t.key();
      },
      'key',
    ],
    [
      'pointer down',
      (t: Trap) => {
        t.pointerDown();
      },
      'pointer-down',
    ],
    [
      'wheel',
      (t: Trap) => {
        t.wheel();
      },
      'wheel',
    ],
    [
      'touch',
      (t: Trap) => {
        t.touch();
      },
      'touch',
    ],
    [
      'fullscreen exit',
      (t: Trap) => {
        t.fullscreenExited();
      },
      'fullscreen-exit',
    ],
  ] as const)('triggers once armed on %s', (_name, act, reason) => {
    const trap = make(100);
    trap.start();
    advance(100);
    act(trap);
    expect(trap.phase).toBe('triggered');
    expect(triggers).toEqual([reason]);
  });

  it('needs the pointer to travel the threshold within one burst', () => {
    const trap = make(100, 10);
    trap.start();
    advance(100);
    trap.pointerMove(3, 4); // 5 px
    expect(triggers).toEqual([]);
    advance(MOVE_BURST_GAP_MS + 1); // the jitter settles: travel resets
    trap.pointerMove(3, 4);
    advance(50);
    trap.pointerMove(0, 4); // 5 + 4
    expect(triggers).toEqual([]);
    advance(50);
    trap.pointerMove(1, 0); // 10
    expect(triggers).toEqual(['pointer-move']);
  });

  it('ignores zero and non-finite movement', () => {
    const trap = make(100, 1);
    trap.start();
    advance(100);
    trap.pointerMove(0, 0);
    trap.pointerMove(Number.NaN, 5);
    trap.pointerMove(Number.POSITIVE_INFINITY, 0);
    expect(trap.phase).toBe('armed');
  });

  it('triggers only once', () => {
    const trap = make(100);
    trap.start();
    advance(100);
    trap.key();
    trap.key();
    trap.pointerMove(500, 500);
    expect(triggers).toEqual(['key']);
  });

  it('cancels back to idle when fullscreen is left while arming', () => {
    const trap = make(1000);
    trap.start();
    advance(500);
    trap.fullscreenExited();
    expect(trap.phase).toBe('idle');
    expect(cancelled).toBe(1);
    advance(5000);
    expect(trap.phase).toBe('idle');
    expect(armed).toBe(0);
  });

  it('can be reset and started again', () => {
    const trap = make(100);
    trap.start();
    advance(100);
    trap.key();
    trap.reset();
    expect(trap.phase).toBe('idle');
    trap.start();
    advance(100);
    expect(trap.phase).toBe('armed');
  });

  it('start() is a no-op unless idle', () => {
    const trap = make(1000);
    trap.start();
    advance(900);
    trap.start(); // must not restart the timer
    advance(100);
    expect(trap.phase).toBe('armed');
  });
});
