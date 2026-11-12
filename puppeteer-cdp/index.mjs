// Puppeteer attached over CDP to a Browz profile.
//
//   npm install
//   node index.mjs                         # a throwaway profile, created and removed again
//   BROWZ_PROFILE_ID=<id> node index.mjs   # an existing profile (started and stopped, never deleted)
//
// Use puppeteer.connect() on the browser Browz started. Never puppeteer.launch(): that runs a
// different browser with none of the profile's fingerprint, proxy, cookies or storage.
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

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

const owned = !process.env.BROWZ_PROFILE_ID;
const profileId = process.env.BROWZ_PROFILE_ID
  || (await api('/api/v1/profile/create', { name: `recipe-puppeteer-${Date.now()}` })).data.id;

let browser;
let started = false;
try {
  // 1. Start through Browz.
  const { data: session } = await api('/api/v1/browser/start', { id: profileId });
  started = true;

  // 2. Attach. browserWSEndpoint is the browser's ws:// URL; browserURL (http://127.0.0.1:<port>)
  //    works too. defaultViewport: null keeps the profile's own window and screen size, which are
  //    part of its fingerprint; Puppeteer's default would resize every page to 800x600.
  browser = session.wsEndpoint
    ? await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint, defaultViewport: null })
    : await puppeteer.connect({ browserURL: session.cdpEndpoint, defaultViewport: null });

  // 3. Reuse the profile's first tab.
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto(URL_TO_OPEN, { waitUntil: 'load', timeout: 30_000 });
  const title = await page.title();
  await writeFile('screenshot.png', await page.screenshot());
  console.log(JSON.stringify({ ok: true, profileId, browser: await browser.version(), url: page.url(), title, screenshot: 'screenshot.png' }));
} finally {
  // 4. disconnect() leaves the browser running; Browz stops it and saves the profile.
  if (browser) await browser.disconnect().catch(() => {});
  if (started) await api('/api/v1/browser/stop', { id: profileId }).catch((e) => console.error(String(e)));
  if (owned) {
    await api('/api/v1/profile/delete', { id: profileId });
    await api('/api/v1/profile/purge', { id: profileId });
  }
}
