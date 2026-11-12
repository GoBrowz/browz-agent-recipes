// Two accounts, kept apart: two Browz profiles sign in to the same site side by side, each with
// its own cookies and storage, driven only through the Local API's page model (snapshot + act).
//
//   node index.mjs                       # against the small demo site this script serves on 127.0.0.1
//   BROWZ_PROXY_A=<pool id> BROWZ_PROXY_B=<pool id> node index.mjs   # each profile on its own exit
//
// Use this pattern only on sites whose terms allow you to hold more than one account (many do, for
// example separate business and personal accounts, or one per client you manage). The demo site
// here is ours and exists for this recipe.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── Local API credentials ────────────────────────────────────────────────────────────────────
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

// ── The demo site: a sign-in form that sets a session cookie, and an account page ──────────────
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
function demoSite() {
  const server = http.createServer((req, res) => {
    const user = /(?:^|;\s*)demo_user=([a-z0-9-]+)/.exec(req.headers.cookie || '')?.[1];
    if (req.method === 'POST' && req.url === '/login') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const name = (new URLSearchParams(body).get('name') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'anonymous';
        res.writeHead(303, { 'Set-Cookie': `demo_user=${name}; Path=/; HttpOnly; SameSite=Lax`, Location: '/account' });
        res.end();
      });
      return;
    }
    if (req.url === '/account') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Account', user ? `<h1>Signed in as ${user}</h1>` : '<h1>Not signed in</h1><a href="/login">Sign in</a>'));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Demo sign-in', `<h1>Demo shop</h1><form method="post" action="/login">
      <label>Account name <input name="name" autocomplete="off"></label>
      <button type="submit">Continue</button></form>`));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** The ref of the first snapshot line with this role and accessible name, e.g. `textbox "Account name" [e5]`. */
function refOf(snapshot, role, name) {
  const line = snapshot.split('\n').find((l) => l.includes(`${role} "${name}`) && /\[e\d+\]/.test(l));
  if (!line) throw new Error(`no ${role} "${name}" in the snapshot:\n${snapshot}`);
  return /\[(e\d+)\]/.exec(line)[1];
}

/** Sign one profile in as `name` the way a person would: read the page, fill the field, click. */
async function signIn(id, base, name) {
  await api('/api/v1/browser/navigate', { id, url: `${base}/login` });
  const snap = (await api('/api/v1/browser/snapshot', { id, mode: 'interactive' })).data.snapshot;
  await api('/api/v1/browser/act', { id, action: 'fill', ref: refOf(snap, 'textbox', 'Account name'), text: name });
  await api('/api/v1/browser/act', { id, action: 'click', ref: refOf(snap, 'button', 'Continue') });
  const waited = (await api('/api/v1/browser/wait', { id, text: `Signed in as ${name}`, timeoutMs: 15_000 })).data;
  if (!waited.matched) throw new Error(`${name}: sign-in did not finish`);
}

async function whoIsSignedIn(id, base) {
  await api('/api/v1/browser/navigate', { id, url: `${base}/account` });
  const { title, snapshot } = (await api('/api/v1/browser/snapshot', { id })).data;
  return { title, heading: /heading "([^"]+)"/.exec(snapshot)?.[1] ?? null };
}

const site = await demoSite();
const base = `http://127.0.0.1:${site.address().port}`;
const accounts = [
  { label: 'alice', proxyId: process.env.BROWZ_PROXY_A },
  { label: 'bob', proxyId: process.env.BROWZ_PROXY_B },
];
const made = [];
try {
  // One profile per account. Each has its own seed (fingerprint), folder (cookies, storage) and,
  // when you pass one, its own proxy. Two profiles without proxies share this machine's IP.
  for (const a of accounts) {
    const { data } = await api('/api/v1/profile/create', { name: `recipe-account-${a.label}-${Date.now()}`, ...(a.proxyId ? { proxyId: a.proxyId } : {}) });
    made.push({ ...a, id: data.id });
  }
  await Promise.all(made.map((a) => api('/api/v1/browser/start', { id: a.id })));
  // Both sign in at the same time, in their own browsers.
  await Promise.all(made.map((a) => signIn(a.id, base, a.label)));
  // Each profile still sees only its own account: the cookie lives in that profile alone.
  const seen = await Promise.all(made.map(async (a) => ({ profile: a.id, expected: a.label, ...(await whoIsSignedIn(a.id, base)) })));
  const ok = seen.every((s) => s.heading === `Signed in as ${s.expected}`);
  console.log(JSON.stringify({ ok, site: base, accounts: seen }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  for (const a of made) {
    await api('/api/v1/browser/stop', { id: a.id }).catch(() => {});
    await api('/api/v1/profile/delete', { id: a.id }).catch(() => {});
    await api('/api/v1/profile/purge', { id: a.id }).catch((e) => console.error(String(e)));
  }
  site.close();
}
