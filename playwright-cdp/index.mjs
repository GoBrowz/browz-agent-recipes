// Playwright attached over CDP to a Browz profile.
//
//   npm install
//   node index.mjs                      # a throwaway profile, created and removed again
//   BROWZ_PROFILE_ID=<id> node index.mjs   # an existing profile (started and stopped, never deleted)
//
// The rule that matters: ATTACH to the browser Browz started (chromium.connectOverCDP). Never
// chromium.launch(): that starts stock Chromium with its own fingerprint and none of the profile's
// cookies, proxy or storage.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const URL_TO_OPEN = process.env.BROWZ_TEST_URL || 'https://example.com/';

// ── Local API credentials: the Browz app writes its token to <data dir>/api-token ──────────────
const DATA = process.env.BROWZ_DATA || join(homedir(), '.browz');
const TOKEN = process.env.BROWZ_TOKEN || (await readFile(join(DATA, 'api-token'), 'utf8')).trim();
let HOST = process.env.BROWZ_API;
if (!HOST) {
  let port = 50333;
  try { port = JSON.parse(await readFile(join(DATA, 'agent.json'), 'utf8')).port || port; } catch { /* default port */ }
  HOST = `127.0.0.1:${port}`;
}

/** One Local API call. Throws with the agent's own message on failure. */
async function api(path, body) {
  const res = await fetch(`http://${HOST}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (typeof json.code === 'number' && json.code !== 0)) {
    throw new Error(`${path}: ${json.msg || json.error || `HTTP ${res.status}`}`);
  }
  return json;
}

// ── 1. A profile: your own, or a throwaway one ────────────────────────────────────────────────
const owned = !process.env.BROWZ_PROFILE_ID;
const profileId = process.env.BROWZ_PROFILE_ID
  || (await api('/api/v1/profile/create', { name: `recipe-playwright-${Date.now()}` })).data.id;

let browser;
let started = false;
try {
  // ── 2. Start it through Browz. The reply carries the CDP endpoints. ───────────────────────────
  const { data: session } = await api('/api/v1/browser/start', { id: profileId });
  started = true;

  // ── 3. Attach. Use the existing context: it IS the profile (cookies, storage). ───────────────
  //    browser.newContext() would make an incognito-like context without the profile's state.
  browser = await chromium.connectOverCDP(session.wsEndpoint || session.cdpEndpoint, { timeout: 30_000 });
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.newPage());

  // ── 4. Ordinary Playwright from here on. ───────────────────────────────────────────────────────
  await page.goto(URL_TO_OPEN, { waitUntil: 'load', timeout: 30_000 });
  const title = await page.title();
  await writeFile('screenshot.png', await page.screenshot());
  console.log(JSON.stringify({ ok: true, profileId, browser: browser.version(), url: page.url(), title, screenshot: 'screenshot.png' }));
} finally {
  // ── 5. Detach (close() on a CDP connection does not kill Browz's browser), then stop through
  //       Browz so the profile is saved cleanly. A throwaway profile is deleted and purged.
  if (browser) await browser.close().catch(() => {});
  if (started) await api('/api/v1/browser/stop', { id: profileId }).catch((e) => console.error(String(e)));
  if (owned) {
    await api('/api/v1/profile/delete', { id: profileId });
    await api('/api/v1/profile/purge', { id: profileId });
  }
}
