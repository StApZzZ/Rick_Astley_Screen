/**
 * Runtime configuration.
 *
 * The page reads `config.json` next to `index.html` at start-up. The container
 * image renders that file from environment variables (see
 * docker/entrypoint/40-rickroll-config.sh), so one image serves every
 * deployment. Anything missing or malformed falls back to the defaults below:
 * a broken config must never break the prank.
 */

export interface MediaSource {
  /** Absolute https URL, or a path relative to the page. */
  readonly src: string;
  /** MIME type with optional codecs, e.g. `video/mp4`. */
  readonly type: string;
}

export interface RuntimeConfig {
  readonly defaultMessage: string;
  readonly maxMessageLength: number;
  /** Candidate sources in order of preference; the first playable one wins. */
  readonly media: readonly MediaSource[];
  /** How long the mouse must stay still after OK before the trap is armed. */
  readonly armDelayMs: number;
  /** Cumulative pointer travel (px) that counts as "someone moved the mouse". */
  readonly moveThresholdPx: number;
  readonly loop: boolean;
  /** Show the "lock your computer" hint under the message. */
  readonly lockHint: boolean;
  /** Download the whole video into memory up front so playback never stalls. */
  readonly prefetch: boolean;
}

export const DEFAULT_MESSAGE = 'Тебя Рик Астнули';

export const DEFAULT_CONFIG: RuntimeConfig = {
  defaultMessage: DEFAULT_MESSAGE,
  maxMessageLength: 140,
  media: [{ src: 'media/never-gonna-give-you-up.mp4', type: 'video/mp4' }],
  armDelayMs: 1500,
  moveThresholdPx: 12,
  loop: true,
  lockHint: true,
  prefetch: true,
};

const LIMITS = {
  maxMessageLength: { min: 1, max: 500 },
  armDelayMs: { min: 0, max: 60_000 },
  moveThresholdPx: { min: 1, max: 500 },
} as const;

const MIME_RE = /^(video|audio)\/[a-z0-9.+-]+(\s*;\s*codecs="?[a-zA-Z0-9.,+\s-]+"?)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intInRange(value: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  return n < range.min || n > range.max ? fallback : n;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Accept only http(s) URLs or plain relative paths. Anything else
 * (`javascript:`, `data:`, protocol-relative `//host`) is dropped: the value
 * ends up in a media element's `src`.
 */
export function isSafeMediaUrl(src: string, base: string): boolean {
  if (src.length === 0 || src.length > 2048) return false;
  if (src.startsWith('//') || src.includes('\\')) return false;
  for (const ch of src) if (isControl(ch.codePointAt(0) ?? 0)) return false;
  let url: URL;
  try {
    url = new URL(src, base);
  } catch {
    return false;
  }
  return url.protocol === 'https:' || url.protocol === 'http:';
}

/** C0/C1 control characters. */
function isControl(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

/**
 * Invisible characters that can disguise or reorder text: zero-width space,
 * LRM/RLM and the bidi embeddings/isolates. ZWNJ/ZWJ (U+200C/D) stay: emoji
 * sequences and several scripts need them.
 */
function isInvisible(cp: number): boolean {
  return (
    cp === 0x200b ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Collapse whitespace, drop control and bidi characters, cap the length in graphemes. */
export function normalizeMessage(raw: string, maxLength: number): string {
  let cleaned = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    cleaned += isControl(cp) || isInvisible(cp) ? ' ' : ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  let out = '';
  let count = 0;
  for (const { segment } of graphemes.segment(cleaned)) {
    if (count === maxLength) break;
    out += segment;
    count += 1;
  }
  return out.trim();
}

function parseMedia(value: unknown, base: string): MediaSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: MediaSource[] = [];
  for (const item of value.slice(0, 8)) {
    if (!isRecord(item)) continue;
    const { src, type } = item;
    if (typeof src !== 'string' || typeof type !== 'string') continue;
    if (!isSafeMediaUrl(src, base) || !MIME_RE.test(type)) continue;
    out.push({ src, type });
  }
  return out.length > 0 ? out : undefined;
}

/** Merge an untrusted JSON value over the defaults, field by field. */
export function parseConfig(input: unknown, base: string): RuntimeConfig {
  if (!isRecord(input)) return DEFAULT_CONFIG;
  const maxMessageLength = intInRange(
    input.maxMessageLength,
    LIMITS.maxMessageLength,
    DEFAULT_CONFIG.maxMessageLength,
  );
  const message =
    typeof input.defaultMessage === 'string' ? normalizeMessage(input.defaultMessage, maxMessageLength) : '';
  return {
    defaultMessage: message || DEFAULT_CONFIG.defaultMessage,
    maxMessageLength,
    media: parseMedia(input.media, base) ?? DEFAULT_CONFIG.media,
    armDelayMs: intInRange(input.armDelayMs, LIMITS.armDelayMs, DEFAULT_CONFIG.armDelayMs),
    moveThresholdPx: intInRange(
      input.moveThresholdPx,
      LIMITS.moveThresholdPx,
      DEFAULT_CONFIG.moveThresholdPx,
    ),
    loop: bool(input.loop, DEFAULT_CONFIG.loop),
    lockHint: bool(input.lockHint, DEFAULT_CONFIG.lockHint),
    prefetch: bool(input.prefetch, DEFAULT_CONFIG.prefetch),
  };
}

export async function loadConfig(base: string = document.baseURI): Promise<RuntimeConfig> {
  try {
    const res = await fetch(new URL('config.json', base), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return DEFAULT_CONFIG;
    return parseConfig(await res.json(), base);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * A message preset in the URL fragment: `#m=Hello`. The fragment never
 * reaches the server, so a prepared link does not leave the text in access logs.
 */
export function messageFromHash(hash: string, maxLength: number): string {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const raw = params.get('m');
  return raw === null ? '' : normalizeMessage(raw, maxLength);
}
