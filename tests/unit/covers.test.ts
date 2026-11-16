import { describe, expect, it } from 'vitest';
import {
  coverFeatures,
  hasOtherScreens,
  otherScreens,
  ScreenCovers,
  screensPermission,
} from '../../src/covers';

const left = { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1040 };
const right = { availLeft: 1920, availTop: -120, availWidth: 2560, availHeight: 1400 };

const fakeWindow = (opts: { api: boolean; extended?: boolean }): Window =>
  ({
    screen: { isExtended: opts.extended },
    ...(opts.api
      ? { getScreenDetails: () => Promise.resolve({ screens: [left, right], currentScreen: left }) }
      : {}),
  }) as unknown as Window;

describe('hasOtherScreens', () => {
  it('needs both the API and an extended desktop', () => {
    expect(hasOtherScreens(fakeWindow({ api: true, extended: true }))).toBe(true);
    expect(hasOtherScreens(fakeWindow({ api: true, extended: false }))).toBe(false);
    expect(hasOtherScreens(fakeWindow({ api: false, extended: true }))).toBe(false);
    expect(hasOtherScreens(fakeWindow({ api: true }))).toBe(false);
  });
});

describe('otherScreens', () => {
  it('drops the screen the page is on', () => {
    expect(otherScreens({ screens: [left, right], currentScreen: right })).toEqual([left]);
    expect(otherScreens({ screens: [left], currentScreen: left })).toEqual([]);
  });
});

describe('coverFeatures', () => {
  it('places a popup over the work area, negative offsets included', () => {
    expect(coverFeatures(right)).toBe('popup,left=1920,top=-120,width=2560,height=1400,fullscreen');
  });
});

describe('screensPermission', () => {
  it('reports the state, or undefined where the name is unknown', async () => {
    const granted = {
      permissions: { query: () => Promise.resolve({ state: 'granted' }) },
    } as unknown as Navigator;
    const unknown = {
      permissions: { query: () => Promise.reject(new TypeError('unknown permission')) },
    } as unknown as Navigator;
    await expect(screensPermission(granted)).resolves.toBe('granted');
    await expect(screensPermission(unknown)).resolves.toBeUndefined();
  });
});

describe('ScreenCovers.load', () => {
  it('is ready once the details are granted', async () => {
    const covers = new ScreenCovers();
    expect(covers.ready).toBe(false);
    await expect(covers.load(fakeWindow({ api: true, extended: true }))).resolves.toBe(true);
    expect(covers.ready).toBe(true);
  });

  it('stays off when the prompt is refused or the API is missing', async () => {
    const refused = {
      getScreenDetails: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    } as unknown as Window;
    const covers = new ScreenCovers();
    await expect(covers.load(refused)).resolves.toBe(false);
    await expect(covers.load(fakeWindow({ api: false }))).resolves.toBe(false);
    expect(covers.ready).toBe(false);
  });
});
