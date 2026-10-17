import './styles.css';
import { loadConfig, messageFromHash, normalizeMessage, type RuntimeConfig } from './config';
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
    ui.caption.textContent = message;
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
  ui.input.select();
}

void main();
