import './styles.css';
import { loadConfig, messageFromHash, normalizeMessage, type RuntimeConfig } from './config';
import { emoteImage, hasEmote, renderMessage } from './emotes';
import { currentPlatform, lockShortcut, pickStrings, type Strings } from './i18n';
import { MediaController, type MediaStatus } from './media';
import { enterFullscreen, exitFullscreen, isFullscreen, ScreenWakeLock } from './screen';
import { Trap } from './trap';

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing`);
  return el;
}

const ui = {
  setup: byId('setup', HTMLElement),
  form: byId('setup-form', HTMLFormElement),
  title: byId('title', HTMLHeadingElement),
  lead: byId('lead', HTMLParagraphElement),
  label: byId('message-label', HTMLLabelElement),
  input: byId('message', HTMLInputElement),
  submit: byId('go', HTMLButtonElement),
  status: byId('status', HTMLParagraphElement),
  preview: byId('preview', HTMLParagraphElement),
  emoteBar: byId('emote-bar', HTMLDivElement),
  howTitle: byId('how-title', HTMLElement),
  howSteps: byId('how-steps', HTMLOListElement),
  blackout: byId('blackout', HTMLDivElement),
  stage: byId('stage', HTMLElement),
  video: byId('video', HTMLVideoElement),
  caption: byId('caption', HTMLParagraphElement),
  hint: byId('hint', HTMLParagraphElement),
  sound: byId('sound', HTMLParagraphElement),
  stop: byId('stop', HTMLButtonElement),
};

type View = 'setup' | 'blackout' | 'stage';

function show(view: View): void {
  ui.setup.hidden = view !== 'setup';
  ui.blackout.hidden = view !== 'blackout';
  ui.stage.hidden = view !== 'stage';
  document.body.dataset.view = view;
}

function applyStrings(t: Strings, config: RuntimeConfig): void {
  document.documentElement.lang = t.lang;
  ui.title.textContent = t.title;
  ui.lead.textContent = t.lead;
  ui.label.textContent = t.messageLabel;
  ui.submit.textContent = t.submit;
  ui.howTitle.textContent = t.howTitle;
  ui.howSteps.replaceChildren(
    ...t.howSteps.map((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      return li;
    }),
  );
  ui.stop.setAttribute('aria-label', t.stop);
  ui.stop.title = t.stop;
  ui.input.maxLength = config.maxMessageLength;
  ui.input.placeholder = config.defaultMessage;
}

function statusText(t: Strings, s: MediaStatus): string {
  switch (s.kind) {
    case 'loading':
      return t.loading(s.percent);
    case 'ready':
      return t.ready;
    case 'streaming':
      return t.streaming;
    case 'missing':
      return t.missing;
    case 'unsupported':
      return t.unsupported;
  }
}

async function main(): Promise<void> {
  const t = pickStrings(navigator.languages);
  const config = await loadConfig();
  const shortcut = lockShortcut(currentPlatform());
  applyStrings(t, config);
  ui.input.value = messageFromHash(location.hash, config.maxMessageLength) || config.defaultMessage;

  // Emotes: a live preview under the field (`:pepe:` shows as the picture) and a
  // button per emote that inserts its token at the caret.
  const updatePreview = (): void => {
    const text = normalizeMessage(ui.input.value, config.maxMessageLength) || config.defaultMessage;
    ui.preview.hidden = !hasEmote(text, config.emotes);
    if (!ui.preview.hidden) renderMessage(ui.preview, text, config.emotes);
  };
  const insertToken = (token: string): void => {
    const el = ui.input;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const head = before + (before === '' || before.endsWith(' ') ? '' : ' ') + token;
    const next = head + el.value.slice(end);
    if (next.length > config.maxMessageLength) return;
    el.value = next;
    el.focus();
    el.setSelectionRange(head.length, head.length);
    updatePreview();
  };
  for (const [name, emote] of config.emotes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emote-button';
    button.title = `:${name}:`;
    button.setAttribute('aria-label', t.insertEmote(name));
    const { src } = emote;
    button.append(src ? emoteImage(name, { ...emote, src }, document.baseURI) : emote.alt);
    button.addEventListener('click', () => {
      insertToken(`:${name}:`);
    });
    ui.emoteBar.append(button);
  }
  ui.emoteBar.hidden = config.emotes.size === 0;
  ui.input.addEventListener('input', updatePreview);
  updatePreview();

  const media = new MediaController(ui.video, config.media, {
    loop: config.loop,
    prefetch: config.prefetch,
    onStatus: (s) => {
      ui.status.textContent = statusText(t, s);
      ui.status.dataset.kind = s.kind;
    },
  });
  media.init();

  const wakeLock = new ScreenWakeLock();
  const pageTitle = document.title;
  let soundPending = false;

  const backToSetup = (note: string): void => {
    trap.reset();
    media.stop();
    soundPending = false;
    document.title = pageTitle;
    delete document.body.dataset.armed;
    void wakeLock.release();
    void exitFullscreen();
    show('setup');
    ui.status.textContent = note;
    ui.status.dataset.kind = 'note';
    ui.input.focus();
  };

  const trap = new Trap({
    armDelayMs: config.armDelayMs,
    moveThresholdPx: config.moveThresholdPx,
    onArmed: () => {
      document.body.dataset.armed = 'true';
    },
    onCancel: () => {
      backToSetup('');
    },
    onTrigger: () => {
      delete document.body.dataset.armed;
      document.title = 'Never Gonna Give You Up';
      show('stage');
      ui.sound.hidden = true;
      void media.play().then((result) => {
        soundPending = result === 'muted';
        ui.sound.hidden = !soundPending;
      });
    },
  });

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = normalizeMessage(ui.input.value, config.maxMessageLength) || config.defaultMessage;
    renderMessage(ui.caption, message, config.emotes);
    ui.hint.textContent = config.lockHint ? t.lockHint(shortcut) : '';
    ui.sound.textContent = t.soundPrompt;
    // Everything that needs this click's user activation runs synchronously here.
    media.unlock();
    void enterFullscreen();
    void wakeLock.acquire();
    ui.input.blur();
    show('blackout');
    trap.start();
  });

  ui.stop.addEventListener('click', (event) => {
    event.stopPropagation();
    backToSetup(t.afterStop(shortcut));
  });

  // --- input wiring: everything feeds the trap; the trap decides ------------------
  let last: { x: number; y: number } | undefined;
  window.addEventListener(
    'pointermove',
    (e) => {
      const prev = last;
      last = { x: e.clientX, y: e.clientY };
      const dx = prev ? e.clientX - prev.x : e.movementX;
      const dy = prev ? e.clientY - prev.y : e.movementY;
      trap.pointerMove(dx, dy);
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', () => {
    trap.pointerDown();
  });
  window.addEventListener(
    'wheel',
    () => {
      trap.wheel();
    },
    { passive: true },
  );
  window.addEventListener(
    'touchstart',
    () => {
      trap.touch();
    },
    { passive: true },
  );
  window.addEventListener('keydown', () => {
    trap.key();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!isFullscreen()) trap.fullscreenExited();
  });

  // A refused unmuted play() is retried on the next real gesture.
  const retrySound = (): void => {
    if (!soundPending) return;
    void media.unmute().then((ok) => {
      soundPending = !ok;
      ui.sound.hidden = ok;
    });
  };
  window.addEventListener('pointerup', retrySound);
  window.addEventListener('keyup', retrySound);

  // The black screen must not open a context menu or select anything.
  document.addEventListener('contextmenu', (e) => {
    if (document.body.dataset.view !== 'setup') e.preventDefault();
  });

  show('setup');
  ui.input.focus();
  // Everything selected (typing replaces the default), caret at the start so a
  // long default reads from its beginning instead of scrolled to its end.
  ui.input.setSelectionRange(0, ui.input.value.length, 'backward');
  ui.input.scrollLeft = 0;
}

void main();
