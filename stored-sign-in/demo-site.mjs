// A tiny demo site with a real sign-in: username, password, then a one-time code (TOTP), then a
// "Signed in as …" page. It runs on your computer only (127.0.0.1, a random port), so the recipe
// never signs in to anyone else's site.
//
//   node demo-site.mjs              # username + password + one-time code
//   node demo-site.mjs --no-totp    # username + password only
//
// Each start makes a fresh random password and TOTP seed. The site writes them to a file only you
// can read (mode 600), one per line in the order `browz credential add --password-stdin` reads
// them: the password, then the seed. Hand that file to Browz, then delete it (the site also deletes it
// when it stops); the secrets are never printed and never sit in this folder.
import http from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USERNAME = 'demo-user';
const WITH_TOTP = !process.argv.includes('--no-totp');

// ── Fresh secrets for this run ─────────────────────────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32 = (buf) => {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map((c) => B32[parseInt(c.padEnd(5, '0'), 2)]).join('');
};
const unbase32 = (s) => {
  const bits = [...s].map((c) => B32.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
};
const password = randomBytes(18).toString('base64url');
const seed = base32(randomBytes(20));

/** RFC 6238: SHA-1, 30-second steps, 6 digits. */
function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', unbase32(secret)).update(counter).digest();
  const off = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const codeOk = (code) => {
  const now = Math.floor(Date.now() / 30_000);
  return [now - 1, now, now + 1].some((s) => totp(seed, s) === code);
};
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const dir = mkdtempSync(join(tmpdir(), 'browz-demo-signin-'));
const secretsFile = join(dir, 'secrets');
writeFileSync(secretsFile, WITH_TOTP ? `${password}\n${seed}\n` : `${password}\n`, { mode: 0o600 });

// ── The site ───────────────────────────────────────────────────────────────────────────────────
const sessions = new Map(); // cookie value -> 'password' (code still due) | 'ok'
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px system-ui;max-width:420px;margin:48px auto}label{display:block;margin:12px 0}input{display:block;width:100%;padding:6px}</style>
</head><body>${body}</body></html>`;
const loginForm = (msg = '') => page('Sign in', `<h1>Sign in to the demo site</h1>${msg ? `<p role="alert">${msg}</p>` : ''}
<form method="post" action="/login">
  <label>Username <input name="username" type="text" autocomplete="username"></label>
  <label>Password <input name="password" type="password" autocomplete="current-password"></label>
  <button type="submit">Sign in</button>
</form>`);
const codeForm = (msg = '') => page('Verification code', `<h1>Enter your verification code</h1>${msg ? `<p role="alert">${msg}</p>` : ''}
<form method="post" action="/verify">
  <label>Code from your authenticator app <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code"></label>
  <button type="submit">Verify</button>
</form>`);

function readForm(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => resolve(new URLSearchParams(body)));
  });
}
const send = (res, status, html, headers = {}) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(html); };
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };

const server = http.createServer(async (req, res) => {
  const sid = /(?:^|;\s*)demo_sid=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
  const state = sid && sessions.get(sid);
  const path = new URL(req.url, 'http://x').pathname;

  if (req.method === 'POST' && path === '/login') {
    const f = await readForm(req);
    if (f.get('username') !== USERNAME || !same(f.get('password') || '', password)) {
      return send(res, 401, loginForm('Wrong username or password.'));
    }
    const id = randomBytes(16).toString('base64url');
    sessions.set(id, WITH_TOTP ? 'password' : 'ok');
    return redirect(res, WITH_TOTP ? '/verify' : '/account', { 'Set-Cookie': `demo_sid=${id}; Path=/; HttpOnly; SameSite=Lax` });
  }
  if (path === '/verify' && state === 'password') {
    if (req.method !== 'POST') return send(res, 200, codeForm());
    const f = await readForm(req);
    if (!codeOk((f.get('code') || '').trim())) return send(res, 401, codeForm('That code is not right. Try the current one.'));
    sessions.set(sid, 'ok');
    return redirect(res, '/account');
  }
  if (path === '/account') {
    if (state === 'ok') return send(res, 200, page('Account', `<h1>Signed in as ${USERNAME}</h1><p>Your demo account is open.</p>`));
    return redirect(res, '/login');
  }
  if (path === '/login' || path === '/') return send(res, 200, loginForm());
  send(res, 404, page('Not found', '<h1>Not found</h1>'));
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  console.log(`demo site     ${url}/login`);
  console.log(`username      ${USERNAME}`);
  console.log(`secrets file  ${secretsFile}  (${WITH_TOTP ? 'password, then TOTP seed' : 'password'}; mode 600)`);
  console.log('Press Ctrl+C to stop.');
});
// The secrets file goes when the site stops (try-it.sh deletes it as soon as Browz has stored it).
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { rmSync(dir, { recursive: true, force: true }); server.close(); process.exit(0); });
