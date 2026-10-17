import type { MediaSource } from './config';

export type PlayResult = 'sound' | 'muted' | 'failed';

export type MediaStatus =
  | { readonly kind: 'loading'; readonly percent: number | undefined }
  | { readonly kind: 'ready' }
  | { readonly kind: 'streaming' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'missing' };

export interface MediaOptions {
  readonly loop: boolean;
  readonly prefetch: boolean;
  readonly onStatus?: (status: MediaStatus) => void;
  readonly base?: string;
}

/** First source the browser claims it can play (`canPlayType` is "maybe" or "probably"). */
export function pickSource(
  sources: readonly MediaSource[],
  canPlay: (type: string) => string,
): MediaSource | undefined {
  return sources.find((s) => canPlay(s.type) !== '');
}

function errorName(err: unknown): string {
  return err instanceof DOMException || err instanceof Error ? err.name : '';
}

/**
 * Owns the <video>. Browsers only allow sound after a user gesture, so the
 * OK click "unlocks" the element (a muted play/pause inside the gesture,
 * which Safari needs; Chromium and Firefox remember the page's activation
 * anyway). The trigger later is usually a mouse move, which is not a gesture,
 * so a refused unmuted play() falls back to muted playback, and `unmute()`
 * is retried on the next click or key press.
 */
export class MediaController {
  readonly #video: HTMLVideoElement;
  readonly #opts: MediaOptions;
  readonly #source: MediaSource | undefined;
  readonly #url: URL | undefined;
  #blobUrl: string | undefined;
  #started = false;
  #prefetch: AbortController | undefined;

  constructor(video: HTMLVideoElement, sources: readonly MediaSource[], opts: MediaOptions) {
    this.#video = video;
    this.#opts = opts;
    this.#source = pickSource(sources, (t) => video.canPlayType(t));
    this.#url = this.#source ? new URL(this.#source.src, opts.base ?? document.baseURI) : undefined;
  }

  get source(): MediaSource | undefined {
    return this.#source;
  }

  /** Point the element at the stream and start the background download. */
  init(): void {
    const v = this.#video;
    v.loop = this.#opts.loop;
    v.playsInline = true;
    v.controls = false;
    v.disablePictureInPicture = true;
    v.disableRemotePlayback = true;
    // CORS mode: required by Cross-Origin-Embedder-Policy and by the blob prefetch.
    v.crossOrigin = 'anonymous';
    if (!this.#url) {
      this.#status({ kind: 'unsupported' });
      return;
    }
    v.preload = 'auto';
    v.src = this.#url.href;
    if (this.#opts.prefetch) void this.#download(this.#url);
    else void this.#probe(this.#url);
  }

  /** Call synchronously inside the click/keypress that arms the trap. */
  unlock(): void {
    const v = this.#video;
    if (!v.currentSrc && !v.src) return;
    v.muted = true;
    v.play().then(
      () => {
        if (!this.#started) {
          v.pause();
          v.currentTime = 0;
        }
      },
      () => undefined,
    );
  }

  async play(): Promise<PlayResult> {
    const v = this.#video;
    this.#started = true;
    if (!v.src) return 'failed';
    v.currentTime = 0;
    v.volume = 1;
    v.muted = false;
    try {
      await v.play();
      return 'sound';
    } catch (err) {
      if (errorName(err) !== 'NotAllowedError') return 'failed';
    }
    v.muted = true;
    try {
      await v.play();
      return 'muted';
    } catch {
      return 'failed';
    }
  }

  async unmute(): Promise<boolean> {
    const v = this.#video;
    v.muted = false;
    try {
      if (v.paused) await v.play();
      return !v.muted;
    } catch {
      v.muted = true;
      return false;
    }
  }

  stop(): void {
    this.#started = false;
    this.#video.pause();
    this.#video.currentTime = 0;
  }

  dispose(): void {
    this.#prefetch?.abort();
    if (this.#blobUrl) URL.revokeObjectURL(this.#blobUrl);
  }

  #status(status: MediaStatus): void {
    this.#opts.onStatus?.(status);
  }

  async #probe(url: URL): Promise<void> {
    try {
      const res = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' });
      this.#status(res.ok ? { kind: 'streaming' } : { kind: 'missing' });
    } catch {
      this.#status({ kind: 'missing' });
    }
  }

  async #download(url: URL): Promise<void> {
    const ctrl = new AbortController();
    this.#prefetch = ctrl;
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
      if (!res.ok || !res.body) {
        this.#status({ kind: res.status === 404 ? 'missing' : 'streaming' });
        return;
      }
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      let lastPercent = -1;
      this.#status({ kind: 'loading', percent: total ? 0 : undefined });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        const percent = total ? Math.min(99, Math.floor((received / total) * 100)) : undefined;
        if (percent !== lastPercent) {
          lastPercent = percent ?? -1;
          this.#status({ kind: 'loading', percent });
        }
      }
      const blob = new Blob(chunks, { type: this.#source?.type.split(';')[0] ?? 'video/mp4' });
      // Swap to the in-memory copy only if playback has not begun: a swap
      // mid-song would restart it.
      if (!this.#started) {
        this.#blobUrl = URL.createObjectURL(blob);
        this.#video.src = this.#blobUrl;
        this.#video.load();
      }
      this.#status({ kind: 'ready' });
    } catch (err) {
      if (errorName(err) === 'AbortError') return;
      // CORS refused, network hiccup...: the element still streams the URL.
      this.#status({ kind: 'streaming' });
    } finally {
      this.#prefetch = undefined;
    }
  }
}
