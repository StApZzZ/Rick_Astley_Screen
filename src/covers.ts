/*
 * Other monitors: the Window Management API (Chromium only, behind the
 * "window-management" permission). The page itself goes fullscreen on its own
 * screen; every other screen gets a black popup ("cover") placed over it. One
 * click may open the fullscreen request plus one popup (Chrome's "fullscreen
 * companion window"); more covers need popups allowed for the site.
 */

/** The parts of a `ScreenDetailed` this module reads. */
export interface ScreenArea {
  readonly availLeft: number;
  readonly availTop: number;
  readonly availWidth: number;
  readonly availHeight: number;
}

interface ScreenDetailsLike {
  readonly screens: readonly ScreenArea[];
  readonly currentScreen: ScreenArea;
}

type WindowManagementWindow = Window & { getScreenDetails?: () => Promise<ScreenDetailsLike> };

/** True on a Chromium browser whose desktop spans more than one screen. */
export function hasOtherScreens(win: Window = window): boolean {
  return (
    typeof (win as WindowManagementWindow).getScreenDetails === 'function' &&
    (win.screen as Screen & { isExtended?: boolean }).isExtended === true
  );
}

/** The window-management permission state, or undefined where it cannot be queried. */
export async function screensPermission(nav: Navigator = navigator): Promise<PermissionState | undefined> {
  try {
    const status = await nav.permissions.query({ name: 'window-management' as PermissionName });
    return status.state;
  } catch {
    return undefined;
  }
}

/** Every screen except the one the page is on. */
export function otherScreens(details: ScreenDetailsLike): ScreenArea[] {
  return details.screens.filter((s) => s !== details.currentScreen);
}

/** `window.open` features that cover the screen's work area. */
export function coverFeatures(s: ScreenArea): string {
  return [
    'popup',
    `left=${String(s.availLeft)}`,
    `top=${String(s.availTop)}`,
    `width=${String(s.availWidth)}`,
    `height=${String(s.availHeight)}`,
    // Opens the popup fullscreen where Chrome supports it; ignored elsewhere.
    'fullscreen',
  ].join(',');
}

export class ScreenCovers {
  #details: ScreenDetailsLike | undefined;
  #covers: Window[] = [];
  #listeners: AbortController | undefined;

  /** Asks for the permission (a prompt the first time). Resolves false if refused. */
  async load(win: Window = window): Promise<boolean> {
    const get = (win as WindowManagementWindow).getScreenDetails;
    if (!get) return false;
    try {
      this.#details = await get.call(win);
      return true;
    } catch {
      this.#details = undefined;
      return false;
    }
  }

  get ready(): boolean {
    return this.#details !== undefined;
  }

  /**
   * Must run inside the same user gesture as the fullscreen request. `wire`
   * attaches the input listeners to each cover; they are removed before the
   * covers are closed, so closing them is not mistaken for input.
   */
  open(title: string, wire: (cover: Window, signal: AbortSignal) => void): number {
    this.close();
    const details = this.#details;
    if (!details) return 0;
    const listeners = new AbortController();
    this.#listeners = listeners;
    for (const s of otherScreens(details)) {
      const cover = window.open('', '_blank', coverFeatures(s));
      if (!cover) continue; // Blocked: the popup allowance went to the first one.
      paintBlack(cover, title);
      wire(cover, listeners.signal);
      void cover.document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Needs a gesture in that window unless the site may go fullscreen on
        // its own; the popup already spans the work area.
      });
      this.#covers.push(cover);
    }
    return this.#covers.length;
  }

  close(): void {
    this.#listeners?.abort();
    this.#listeners = undefined;
    for (const cover of this.#covers) {
      try {
        cover.close();
      } catch {
        // Already gone.
      }
    }
    this.#covers = [];
  }
}

/** The popup keeps its initial same-origin about:blank document; CSSOM is not inline style for CSP. */
function paintBlack(cover: Window, title: string): void {
  const doc = cover.document;
  doc.title = title;
  for (const el of [doc.documentElement, doc.body]) {
    el.style.margin = '0';
    el.style.height = '100%';
    el.style.background = '#000';
    el.style.cursor = 'none';
    el.style.overflow = 'hidden';
    el.style.userSelect = 'none';
  }
}
