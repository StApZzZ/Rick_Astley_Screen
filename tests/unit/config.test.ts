import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEFAULT_MESSAGE,
  isSafeMediaUrl,
  messageFromHash,
  normalizeMessage,
  parseConfig,
} from '../../src/config';

const BASE = 'https://prank.example/rick/';

describe('parseConfig', () => {
  it('falls back to the defaults for non-objects', () => {
    for (const v of [null, undefined, 42, 'x', [], true]) {
      expect(parseConfig(v, BASE)).toEqual(DEFAULT_CONFIG);
    }
  });

  it('defaults the message to "Тебя Рик Астнули"', () => {
    expect(DEFAULT_MESSAGE).toBe('Тебя Рик Астнули');
    expect(parseConfig({}, BASE).defaultMessage).toBe('Тебя Рик Астнули');
    expect(parseConfig({ defaultMessage: '   ' }, BASE).defaultMessage).toBe('Тебя Рик Астнули');
  });

  it('takes valid fields', () => {
    const c = parseConfig(
      {
        defaultMessage: 'Hello',
        maxMessageLength: 50,
        media: [{ src: 'https://cdn.example/a.mp4', type: 'video/mp4' }],
        armDelayMs: 0,
        moveThresholdPx: 3,
        loop: false,
        lockHint: false,
        prefetch: false,
      },
      BASE,
    );
    expect(c).toEqual({
      defaultMessage: 'Hello',
      maxMessageLength: 50,
      media: [{ src: 'https://cdn.example/a.mp4', type: 'video/mp4' }],
      armDelayMs: 0,
      moveThresholdPx: 3,
      loop: false,
      lockHint: false,
      prefetch: false,
    });
  });

  it('rejects out-of-range and wrongly typed values field by field', () => {
    const c = parseConfig(
      { armDelayMs: -1, moveThresholdPx: 1e9, maxMessageLength: '50', loop: 'yes', prefetch: 1 },
      BASE,
    );
    expect(c.armDelayMs).toBe(DEFAULT_CONFIG.armDelayMs);
    expect(c.moveThresholdPx).toBe(DEFAULT_CONFIG.moveThresholdPx);
    expect(c.maxMessageLength).toBe(DEFAULT_CONFIG.maxMessageLength);
    expect(c.loop).toBe(DEFAULT_CONFIG.loop);
    expect(c.prefetch).toBe(DEFAULT_CONFIG.prefetch);
  });

  it('drops unsafe media sources and keeps the safe ones in order', () => {
    const c = parseConfig(
      {
        media: [
          { src: 'javascript:alert(1)', type: 'video/mp4' },
          { src: 'data:video/mp4;base64,AAAA', type: 'video/mp4' },
          { src: '//evil.example/x.mp4', type: 'video/mp4' },
          { src: 'clip.webm', type: 'video/webm; codecs="vp9, opus"' },
          { src: 'clip.mp4', type: 'text/html' },
          { src: 'clip.mp4', type: 'video/mp4' },
          'not-an-object',
        ],
      },
      BASE,
    );
    expect(c.media).toEqual([
      { src: 'clip.webm', type: 'video/webm; codecs="vp9, opus"' },
      { src: 'clip.mp4', type: 'video/mp4' },
    ]);
  });

  it('keeps the default media when nothing valid is given', () => {
    expect(parseConfig({ media: [{ src: 'javascript:x', type: 'video/mp4' }] }, BASE).media).toEqual(
      DEFAULT_CONFIG.media,
    );
  });

  it('caps the default message at maxMessageLength', () => {
    expect(parseConfig({ defaultMessage: 'abcdef', maxMessageLength: 3 }, BASE).defaultMessage).toBe('abc');
  });
});

describe('isSafeMediaUrl', () => {
  it.each([
    ['media/a.mp4', true],
    ['./a.mp4', true],
    ['/media/a.mp4', true],
    ['https://cdn.example/a.mp4', true],
    ['http://localhost:8080/a.mp4', true],
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['data:video/mp4,x', false],
    ['blob:https://x/y', false],
    ['//evil.example/a.mp4', false],
    ['a\\b.mp4', false],
    ['a\nb.mp4', false],
    ['', false],
  ])('%s -> %s', (src, ok) => {
    expect(isSafeMediaUrl(src, BASE)).toBe(ok);
  });

  it('rejects absurdly long URLs', () => {
    expect(isSafeMediaUrl(`a${'b'.repeat(3000)}.mp4`, BASE)).toBe(false);
  });
});

describe('normalizeMessage', () => {
  it('collapses whitespace and strips control and bidi characters', () => {
    expect(normalizeMessage('  Тебя\n\tРик \u0000 Астнули‮  ', 100)).toBe('Тебя Рик Астнули');
  });

  it('never splits an emoji when truncating', () => {
    expect(normalizeMessage('ab🎵🎵', 3)).toBe('ab🎵');
    // A ZWJ family is one grapheme and survives intact.
    expect(normalizeMessage('👨\u200d👩\u200d👧x', 1)).toBe('👨\u200d👩\u200d👧');
  });

  it('leaves markup as plain text (rendering uses textContent)', () => {
    expect(normalizeMessage('<img src=x onerror=alert(1)>', 100)).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('messageFromHash', () => {
  it('reads #m=', () => {
    expect(messageFromHash('#m=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82', 100)).toBe('Привет');
    expect(messageFromHash('#x=1&m=Hi+there', 100)).toBe('Hi there');
  });

  it('is empty without m', () => {
    expect(messageFromHash('', 100)).toBe('');
    expect(messageFromHash('#other=1', 100)).toBe('');
  });

  it('normalizes and caps', () => {
    expect(messageFromHash('#m=%20%20abcdef%0A', 4)).toBe('abcd');
  });
});
