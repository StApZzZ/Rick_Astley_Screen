import { describe, expect, it } from 'vitest';
import { lockShortcut, pickStrings } from '../../src/i18n';
import { pickSource } from '../../src/media';

describe('pickStrings', () => {
  it('prefers the first supported language', () => {
    expect(pickStrings(['en-US', 'ru']).lang).toBe('en');
    expect(pickStrings(['ru-RU', 'en']).lang).toBe('ru');
    expect(pickStrings(['kk-KZ']).lang).toBe('ru');
    expect(pickStrings(['de-DE', 'en-GB']).lang).toBe('en');
  });

  it('falls back to Russian', () => {
    expect(pickStrings([]).lang).toBe('ru');
    expect(pickStrings(['ja']).lang).toBe('ru');
  });

  it('formats progress', () => {
    expect(pickStrings(['ru']).loading(42)).toContain('42%');
    expect(pickStrings(['en']).loading(undefined)).not.toContain('%');
  });
});

describe('lockShortcut', () => {
  it.each([
    ['Windows', 'Win + L'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win + L'],
    ['macOS', '⌃ Control + ⌘ Command + Q'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', '⌃ Control + ⌘ Command + Q'],
    ['Linux', 'Super + L'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Super + L'],
    ['Chrome OS', 'Launcher + L'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'Launcher + L'],
    ['', 'Win + L'],
  ])('%s', (platform, expected) => {
    expect(lockShortcut(platform)).toBe(expected);
  });
});

describe('pickSource', () => {
  const sources = [
    { src: 'a.webm', type: 'video/webm' },
    { src: 'a.mp4', type: 'video/mp4' },
  ];

  it('returns the first playable source', () => {
    expect(pickSource(sources, (t) => (t === 'video/mp4' ? 'probably' : ''))?.src).toBe('a.mp4');
    expect(pickSource(sources, () => 'maybe')?.src).toBe('a.webm');
  });

  it('returns undefined when nothing plays', () => {
    expect(pickSource(sources, () => '')).toBeUndefined();
  });
});
