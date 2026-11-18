#!/usr/bin/env node
/* Headless smoke test for whats-happening.
   Deliberately few assertions so it does not become flaky:
   1. No visible #boot-error after boot settles.
   2. At least one rendered .card in #main on the discover view.
   3. Settings renders the "Live data" auto-sync note and no API-key inputs.
   Assertions 1 and 2 catch the runtime boot failures that node --check cannot;
   assertion 3 keeps the browser key panel from quietly coming back now that
   live listings arrive only from the published data/live.json feed.
*/
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8099/sites/whats-happening/';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const bootError = await page.$('#boot-error');
  if (bootError) {
    const text = (await bootError.textContent()) || 'boot error shown';
    console.error('SMOKE FAIL: #boot-error is visible: ' + text.trim().slice(0, 300));
    process.exit(1);
  }
  const cards = await page.$$('#main .card');
  if (cards.length === 0) {
    console.error('SMOKE FAIL: zero rendered cards in #main');
    process.exit(1);
  }

  /* Settings: the panel must show the published-feed note and no key fields. */
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(600);
  const h1 = await page.$eval('#main h1', el => el.textContent.trim()).catch(() => '');
  if (h1 !== 'Settings') {
    console.error('SMOKE FAIL: Settings view did not render (h1 was "' + h1 + '")');
    process.exit(1);
  }
  const headings = await page.$$eval('#main h2', els => els.map(el => el.textContent.trim()));
  const body = await page.$eval('#main', el => el.innerText);
  if (!headings.includes('Live data') || !/refresh automatically/i.test(body)) {
    console.error('SMOKE FAIL: Settings is missing the Live data auto-sync note');
    process.exit(1);
  }
  const keyControls = await page.$$('#main input[type="password"], #main #key-tm, #main #key-yt, #main [data-action="save-keys"], #main [data-action="clear-keys"]');
  if (keyControls.length) {
    console.error('SMOKE FAIL: Settings still shows ' + keyControls.length + ' API-key control(s)');
    process.exit(1);
  }

  console.log('SMOKE OK: no boot-error, ' + cards.length + ' cards, settings note without key inputs');
} finally {
  await browser.close();
}
