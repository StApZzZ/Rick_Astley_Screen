export interface Strings {
  readonly lang: 'ru' | 'en';
  readonly title: string;
  readonly lead: string;
  readonly messageLabel: string;
  readonly submit: string;
  readonly howTitle: string;
  readonly howSteps: readonly string[];
  readonly loading: (percent: number | undefined) => string;
  readonly ready: string;
  readonly streaming: string;
  readonly missing: string;
  readonly unsupported: string;
  readonly soundPrompt: string;
  readonly stop: string;
  readonly lockHint: (shortcut: string) => string;
  readonly afterStop: (shortcut: string) => string;
  readonly insertEmote: (name: string) => string;
}

const ru: Strings = {
  lang: 'ru',
  title: 'Rick Astley Screen',
  lead: 'Коллега отошёл и не заблокировал компьютер? Оставь ему сообщение.',
  messageLabel: 'Сообщение',
  submit: 'OK',
  howTitle: 'Как это работает',
  howSteps: [
    'Нажми OK: экран станет чёрным и развернётся на весь монитор.',
    'Убери руки от мыши и клавиатуры. Через пару секунд ловушка взведётся.',
    'Кто-то шевельнёт мышью или нажмёт клавишу — заиграет Рик Эстли с твоим сообщением.',
    'Выход — Esc или крестик в углу. Ничего не сохраняется и никуда не отправляется.',
  ],
  loading: (p) => (p === undefined ? 'Видео загружается…' : `Видео загружается… ${String(p)}%`),
  ready: 'Видео готово',
  streaming: 'Видео будет проигрываться потоком',
  missing: 'Видео не найдено: проверь media/ или RICKROLL_MEDIA_URL',
  unsupported: 'Браузер не умеет проигрывать этот формат видео',
  soundPrompt: 'Нажми любую клавишу, чтобы включить звук',
  stop: 'Стоп',
  lockHint: (k) => `Уходя, блокируй компьютер: ${k}`,
  afterStop: (k) => `Готово. В следующий раз блокируй компьютер: ${k}`,
  insertEmote: (n) => `Вставить :${n}:`,
};

const en: Strings = {
  lang: 'en',
  title: 'Rick Astley Screen',
  lead: 'A colleague walked away without locking their computer? Leave them a message.',
  messageLabel: 'Message',
  submit: 'OK',
  howTitle: 'How it works',
  howSteps: [
    'Press OK: the screen turns black and goes fullscreen.',
    'Take your hands off the mouse and keyboard. The trap arms after a couple of seconds.',
    'When someone moves the mouse or presses a key, Rick Astley plays with your message.',
    'Esc or the cross in the corner exits. Nothing is stored or sent anywhere.',
  ],
  loading: (p) => (p === undefined ? 'Loading the video…' : `Loading the video… ${String(p)}%`),
  ready: 'Video ready',
  streaming: 'The video will be streamed',
  missing: 'Video not found: check media/ or RICKROLL_MEDIA_URL',
  unsupported: 'This browser cannot play the video format',
  soundPrompt: 'Press any key to turn the sound on',
  stop: 'Stop',
  lockHint: (k) => `Lock your computer when you leave: ${k}`,
  afterStop: (k) => `Done. Next time, lock your computer: ${k}`,
  insertEmote: (n) => `Insert :${n}:`,
};

export function pickStrings(languages: readonly string[]): Strings {
  for (const l of languages) {
    const tag = l.toLowerCase();
    if (tag.startsWith('ru') || tag.startsWith('be') || tag.startsWith('uk') || tag.startsWith('kk'))
      return ru;
    if (tag.startsWith('en')) return en;
  }
  return ru;
}

/** The lock shortcut for the visitor's OS. */
export function lockShortcut(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return '⌃ Control + ⌘ Command + Q';
  if (p.includes('cros') || p.includes('chrome os')) return 'Launcher + L';
  if (p.includes('linux') || p.includes('x11')) return 'Super + L';
  return 'Win + L';
}

interface NavigatorUAData {
  readonly platform?: string;
}

/** `navigator.userAgentData.platform` where available, the UA string otherwise. */
export function currentPlatform(nav: Navigator = navigator): string {
  const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  return uaData?.platform ?? nav.userAgent;
}
