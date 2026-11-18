#!/usr/bin/env node
/* Headless smoke test for whats-happening.
   Only two assertions so it does not become flaky:
   1. No visible #boot-error after boot settles.
   2. At least one rendered .card in #main.
   Both real outages were runtime boot failures that node --check cannot catch.
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
  console.log('SMOKE OK: no boot-error, ' + cards.length + ' cards');
} finally {
  await browser.close();
}
