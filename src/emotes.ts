import type { Emote } from './config';

export type MessagePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emote'; readonly name: string; readonly emote: Emote };

const TOKEN_RE = /:([a-z0-9_]{1,32}):/g;

/** Split a message into text and known `:name:` emotes; unknown tokens stay text. */
export function splitMessage(text: string, emotes: ReadonlyMap<string, Emote>): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const name = m[1] ?? '';
    const emote = emotes.get(name);
    if (!emote) continue;
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'emote', name, emote });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export function hasEmote(text: string, emotes: ReadonlyMap<string, Emote>): boolean {
  return splitMessage(text, emotes).some((p) => p.kind === 'emote');
}

/** An <img> for an emote, falling back to its text if the image does not load. */
export function emoteImage(name: string, emote: Emote & { src: string }, base: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'emote';
  img.alt = emote.alt;
  img.title = `:${name}:`;
  img.draggable = false;
  img.decoding = 'async';
  // CORS mode: allowed under Cross-Origin-Embedder-Policy from any CDN that sends ACAO.
  img.crossOrigin = 'anonymous';
  img.addEventListener(
    'error',
    () => {
      img.replaceWith(document.createTextNode(emote.alt));
    },
    { once: true },
  );
  img.src = new URL(emote.src, base).href;
  return img;
}

/** Render a message into `el` with DOM nodes only (never HTML). */
export function renderMessage(
  el: HTMLElement,
  text: string,
  emotes: ReadonlyMap<string, Emote>,
  base: string = document.baseURI,
): void {
  el.replaceChildren(
    ...splitMessage(text, emotes).map((p): Node => {
      if (p.kind === 'text') return document.createTextNode(p.text);
      const { src } = p.emote;
      return src ? emoteImage(p.name, { ...p.emote, src }, base) : document.createTextNode(p.emote.alt);
    }),
  );
}
