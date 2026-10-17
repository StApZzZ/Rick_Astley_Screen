import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

const ARM_DELAY_MS = 300;

/**
 * Serve a test config and the synthetic fixture clips (VP9/Opus first: the
 * Playwright browsers ship without H.264) instead of whatever the server has.
 */
async function stub(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  const config = {
    defaultMessage: 'Тебя Рик Астнули',
    media: [
      { src: 'media/clip.webm', type: 'video/webm; codecs="vp9, opus"' },
      { src: 'media/clip.mp4', type: 'video/mp4' },
    ],
    armDelayMs: ARM_DELAY_MS,
    moveThresholdPx: 12,
    loop: true,
    lockHint: true,
    prefetch: true,
    ...overrides,
  };
  await page.route('**/config.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) }),
  );
  for (const [name, type] of [
    ['clip.webm', 'video/webm'],
    ['clip.mp4', 'video/mp4'],
  ] as const) {
    await page.route(`**/media/${name}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: type,
        headers: { 'cross-origin-resource-policy': 'same-origin', 'accept-ranges': 'none' },
        body: fixture(name),
      }),
    );
  }
}

/** Record CSP violations and page errors from the very first script. */
async function watchErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.exposeFunction('__reportCsp', (v: string) => errors.push(`csp: ${v}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(
        `${e.violatedDirective} ${e.blockedURI}`,
      );
    });
  });
  return errors;
}

async function arm(page: Page): Promise<void> {
  await expect(page.locator('#status')).toHaveText('Видео готово');
  await page.locator('#go').click();
  await expect(page.locator('#blackout')).toBeVisible();
  await expect(page.locator('#stage')).toBeHidden();
  // Hands off: wait until the trap is armed.
  await expect(page.locator('body')).toHaveAttribute('data-armed', 'true', { timeout: ARM_DELAY_MS * 10 });
}

async function expectPlaying(page: Page, message: string): Promise<void> {
  await expect(page.locator('#stage')).toBeVisible();
  await expect(page.locator('#blackout')).toBeHidden();
  await expect(page.locator('#caption')).toHaveText(message);
  await expect
    .poll(() => page.locator('#video').evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0))
    .toBe(true);
}

test('defaults to "Тебя Рик Астнули" and plays on mouse movement', async ({ page }) => {
  const errors = await watchErrors(page);
  await stub(page);
  await page.goto('./');
  await expect(page.locator('#message')).toHaveValue('Тебя Рик Астнули');
  await page.mouse.move(10, 10);
  await arm(page);
  await page.mouse.move(400, 300, { steps: 8 });
  await expectPlaying(page, 'Тебя Рик Астнули');
  await expect(page.locator('#hint')).toContainText('блокируй компьютер');
  await expect(page).toHaveTitle('Never Gonna Give You Up');
  expect(errors).toEqual([]);
});

test('a key press triggers it with the custom message', async ({ page }) => {
  const errors = await watchErrors(page);
  await stub(page);
  await page.goto('./');
  await page.locator('#message').fill('Обед за твой счёт');
  await expect(page.locator('#status')).toHaveText('Видео готово');
  await page.locator('#message').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-armed', 'true');
  await page.keyboard.press('KeyA');
  await expectPlaying(page, 'Обед за твой счёт');
  expect(errors).toEqual([]);
});

test('movement while arming does not trigger it', async ({ page }) => {
  await stub(page, { armDelayMs: 800 });
  await page.goto('./');
  await expect(page.locator('#status')).toHaveText('Видео готово');
  await page.locator('#go').click();
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(100 + i * 40, 100, { steps: 4 });
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#blackout')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-armed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-armed', 'true', { timeout: 3000 });
  await page.mouse.move(600, 400, { steps: 6 });
  await expect(page.locator('#stage')).toBeVisible();
});

test('a tiny jitter does not trigger it', async ({ page }) => {
  await stub(page);
  await page.goto('./');
  // The click in arm() leaves the pointer on the button's centre.
  const box = await page.locator('#go').boundingBox();
  if (!box) throw new Error('no OK button');
  await arm(page);
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2);
  await page.waitForTimeout(200);
  await expect(page.locator('#blackout')).toBeVisible();
});

test('the message is rendered as text, never as markup', async ({ page }) => {
  const errors = await watchErrors(page);
  await stub(page);
  const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  await page.goto('./');
  await page.locator('#message').fill(payload);
  await arm(page);
  await page.keyboard.press('Space');
  await expectPlaying(page, payload);
  await expect(page.locator('#caption img, #caption script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a message can be preset in the URL fragment', async ({ page }) => {
  await stub(page);
  await page.goto(`./#m=${encodeURIComponent('Привет из ссылки')}`);
  await expect(page.locator('#message')).toHaveValue('Привет из ссылки');
});

test('the stop button returns to the setup screen with the lock hint', async ({ page }) => {
  await stub(page);
  await page.goto('./');
  await arm(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#stage')).toBeVisible();
  await page.locator('#stop').click();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#status')).toContainText('блокируй компьютер');
  await expect(page.locator('#video')).toHaveJSProperty('paused', true);
  await expect(page).toHaveTitle('Rick Astley Screen');
});

test('a missing video is reported on the setup screen', async ({ page }) => {
  await stub(page, { media: [{ src: 'media/nope.webm', type: 'video/webm' }] });
  await page.route('**/media/nope.webm', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('Видео не найдено');
});

test('English UI for English browsers', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await stub(page);
  await page.goto('./');
  await expect(page.locator('#message-label')).toHaveText('Message');
  // The default message stays the configured one.
  await expect(page.locator('#message')).toHaveValue('Тебя Рик Астнули');
  await context.close();
});
