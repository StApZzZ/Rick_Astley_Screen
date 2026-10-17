import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaController, type MediaStatus } from '../../src/media';

const BASE = 'https://prank.example/';

/** Just enough of HTMLVideoElement for MediaController. */
class FakeVideo {
  src = '';
  currentSrc = '';
  muted = false;
  volume = 0.5;
  loop = false;
  playsInline = false;
  controls = true;
  disablePictureInPicture = false;
  disableRemotePlayback = false;
  crossOrigin: string | null = null;
  preload = 'none';
  currentTime = 7;
  paused = true;
  playable = new Set(['video/mp4']);
  /** What play() does next: resolve, or reject with this error name. */
  outcomes: (string | null)[] = [];
  playCalls: { muted: boolean }[] = [];
  loads = 0;

  canPlayType(type: string): string {
    return this.playable.has(type) ? 'probably' : '';
  }

  play(): Promise<void> {
    this.playCalls.push({ muted: this.muted });
    const next = this.outcomes.shift() ?? null;
    if (next) return Promise.reject(new DOMException('refused', next));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.loads += 1;
  }
}

const SOURCES = [{ src: 'media/a.mp4', type: 'video/mp4' }];

function make(
  video: FakeVideo,
  opts: { prefetch?: boolean; statuses?: MediaStatus[] } = {},
): MediaController {
  return new MediaController(video as unknown as HTMLVideoElement, SOURCES, {
    loop: true,
    prefetch: opts.prefetch ?? false,
    base: BASE,
    onStatus: (s) => opts.statuses?.push(s),
  });
}

function bodyResponse(bytes: Uint8Array<ArrayBuffer>, status = 200): Response {
  return new Response(bytes, { status, headers: { 'content-length': String(bytes.byteLength) } });
}

describe('MediaController', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('configures the element for silent, inline, CORS playback', () => {
    const v = new FakeVideo();
    make(v).init();
    expect(v.src).toBe('https://prank.example/media/a.mp4');
    expect(v.loop).toBe(true);
    expect(v.playsInline).toBe(true);
    expect(v.controls).toBe(false);
    expect(v.crossOrigin).toBe('anonymous');
    expect(v.preload).toBe('auto');
  });

  it('reports unsupported when no source is playable', () => {
    const v = new FakeVideo();
    v.playable.clear();
    const statuses: MediaStatus[] = [];
    const m = make(v, { statuses });
    m.init();
    expect(m.source).toBeUndefined();
    expect(v.src).toBe('');
    expect(statuses).toEqual([{ kind: 'unsupported' }]);
  });

  it('plays with sound when allowed, from the start, at full volume', async () => {
    const v = new FakeVideo();
    const m = make(v);
    m.init();
    await expect(m.play()).resolves.toBe('sound');
    expect(v.currentTime).toBe(0);
    expect(v.volume).toBe(1);
    expect(v.playCalls).toEqual([{ muted: false }]);
  });

  it('falls back to muted playback when sound is refused', async () => {
    const v = new FakeVideo();
    v.outcomes = ['NotAllowedError'];
    const m = make(v);
    m.init();
    await expect(m.play()).resolves.toBe('muted');
    expect(v.playCalls).toEqual([{ muted: false }, { muted: true }]);
    expect(v.muted).toBe(true);
  });

  it('gives up on other errors', async () => {
    const v = new FakeVideo();
    v.outcomes = ['NotSupportedError'];
    const m = make(v);
    m.init();
    await expect(m.play()).resolves.toBe('failed');
  });

  it('unmute() retries with sound and reports the outcome', async () => {
    const v = new FakeVideo();
    v.outcomes = ['NotAllowedError'];
    const m = make(v);
    m.init();
    await m.play();
    await expect(m.unmute()).resolves.toBe(true);
    expect(v.muted).toBe(false);

    v.paused = true;
    v.outcomes = ['NotAllowedError'];
    await expect(m.unmute()).resolves.toBe(false);
    expect(v.muted).toBe(true);
  });

  it('unlock() plays muted and rewinds, unless playback has started meanwhile', async () => {
    const v = new FakeVideo();
    const m = make(v);
    m.init();
    m.unlock();
    expect(v.playCalls).toEqual([{ muted: true }]);
    await Promise.resolve();
    expect(v.paused).toBe(true);
    expect(v.currentTime).toBe(0);

    const v2 = new FakeVideo();
    const m2 = make(v2);
    m2.init();
    m2.unlock();
    const played = m2.play(); // the trap fired before the unlock promise settled
    await played;
    await Promise.resolve();
    expect(v2.paused).toBe(false);
  });

  it('stop() pauses and rewinds', async () => {
    const v = new FakeVideo();
    const m = make(v);
    m.init();
    await m.play();
    m.stop();
    expect(v.paused).toBe(true);
    expect(v.currentTime).toBe(0);
  });

  describe('prefetch', () => {
    it('downloads the clip into a blob and switches the element to it', async () => {
      const bytes = new Uint8Array(4096).fill(7);
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(bodyResponse(bytes))),
      );
      const createObjectURL = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:https://prank.example/x');
      const v = new FakeVideo();
      const statuses: MediaStatus[] = [];
      make(v, { prefetch: true, statuses }).init();
      await vi.waitFor(() => {
        expect(statuses.at(-1)).toEqual({ kind: 'ready' });
      });
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(v.src).toBe('blob:https://prank.example/x');
      expect(v.loads).toBe(1);
      expect(statuses[0]).toEqual({ kind: 'loading', percent: 0 });
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(blob.size).toBe(4096);
      expect(blob.type).toBe('video/mp4');
    });

    it('keeps streaming when playback began before the download finished', async () => {
      let release: ((r: Response) => void) | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              release = resolve;
            }),
        ),
      );
      const createObjectURL = vi.spyOn(URL, 'createObjectURL');
      const v = new FakeVideo();
      const statuses: MediaStatus[] = [];
      const m = make(v, { prefetch: true, statuses });
      m.init();
      await m.play();
      release?.(bodyResponse(new Uint8Array(10)));
      await vi.waitFor(() => {
        expect(statuses.at(-1)).toEqual({ kind: 'ready' });
      });
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(v.src).toBe('https://prank.example/media/a.mp4');
    });

    it('reports a missing clip', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))),
      );
      const statuses: MediaStatus[] = [];
      make(new FakeVideo(), { prefetch: true, statuses }).init();
      await vi.waitFor(() => {
        expect(statuses).toEqual([{ kind: 'missing' }]);
      });
    });

    it('falls back to streaming when the download fails (e.g. CORS)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
      );
      const statuses: MediaStatus[] = [];
      const v = new FakeVideo();
      make(v, { prefetch: true, statuses }).init();
      await vi.waitFor(() => {
        expect(statuses).toEqual([{ kind: 'streaming' }]);
      });
      expect(v.src).toBe('https://prank.example/media/a.mp4');
    });
  });

  it('probes with HEAD when prefetch is off', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const statuses: MediaStatus[] = [];
    make(new FakeVideo(), { statuses }).init();
    await vi.waitFor(() => {
      expect(statuses).toEqual([{ kind: 'streaming' }]);
    });
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://prank.example/media/a.mp4'), {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
    });
  });
});
