import { describe, expect, it } from 'vitest';
import { DEFAULT_EMOTES, type Emote } from '../../src/config';
import { hasEmote, splitMessage } from '../../src/emotes';

const EMOTES: ReadonlyMap<string, Emote> = new Map([
  ...DEFAULT_EMOTES,
  ['kek', { src: 'kek.png', alt: ':kek:' }],
]);

describe('splitMessage', () => {
  it('splits text and known emotes', () => {
    expect(splitMessage('лови Рикролл :pepe:', EMOTES)).toEqual([
      { kind: 'text', text: 'лови Рикролл ' },
      { kind: 'emote', name: 'pepe', emote: { alt: '🐸' } },
    ]);
  });

  it('handles adjacent and repeated emotes', () => {
    const parts = splitMessage(':kek::pepe: и :kek:', EMOTES);
    expect(parts.map((p) => (p.kind === 'text' ? p.text : `<${p.name}>`))).toEqual([
      '<kek>',
      '<pepe>',
      ' и ',
      '<kek>',
    ]);
  });

  it('leaves unknown and malformed tokens as text', () => {
    expect(splitMessage('a :nope: :Pepe: : pepe: :pe pe:', EMOTES)).toEqual([
      { kind: 'text', text: 'a :nope: :Pepe: : pepe: :pe pe:' },
    ]);
  });

  it('returns nothing for an empty message', () => {
    expect(splitMessage('', EMOTES)).toEqual([]);
  });

  it('hasEmote', () => {
    expect(hasEmote('x :pepe:', EMOTES)).toBe(true);
    expect(hasEmote('x :nope:', EMOTES)).toBe(false);
  });
});
