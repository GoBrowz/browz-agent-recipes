// Human in the loop: the agent drives a Browz profile through MCP, meets a sign-in page, hands the
// live window to the person at the computer (browz_request_human), waits, and then carries on in
// the same session, signed in. The agent never sees, types or asks for the password.
//
//   npm install
//   node index.mjs                 # against the demo sign-in page this script serves on 127.0.0.1
//
// The profile must run WITH a window (a person has to see it), so run this on the computer where
// the Browz app is open, not under `browz-mcp serve` (its profiles are headless and a handoff is
// refused there). Browz shows a notification and a banner with "I'm done"; this demo also finishes
// by itself when the page reaches /dashboard (doneWhenUrlContains).
//
//   BROWZ_MCP   the browz-mcp binary to run (default: npx -y @browz/mcp, which finds the app's)
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

// ── Demo site: a sign-in form (/login) and a page behind it (/dashboard) ───────────────────────
const html = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const site = http.createServer((req, res) => {
  const signedIn = /(?:^|;\s*)demo_session=ok/.test(req.headers.cookie || '');
  if (req.method === 'POST' && req.url === '/login') {
    req.resume();
    req.on('end', () => { res.writeHead(303, { 'Set-Cookie': 'demo_session=ok; Path=/; HttpOnly; SameSite=Lax', Location: '/dashboard' }); res.end(); });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (req.url === '/dashboard' && signedIn) return res.end(html('Dashboard', '<h1>Welcome back</h1><p>Your orders: 3 open.</p>'));
  res.end(html('Sign in', `<h1>Sign in to the demo shop</h1><form method="post" action="/login">
    <label>Email <input name="email" type="email" autocomplete="username"></label>
    <label>Password <input name="password" type="password" autocomplete="current-password"></label>
    <button type="submit">Sign in</button></form>`));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${site.address().port}`;

// ── The local Browz MCP server over stdio. It reads the app's own credentials. ────────────────
const transport = new StdioClientTransport({
  command: process.env.BROWZ_MCP || 'npx',
  args: process.env.BROWZ_MCP ? [] : ['-y', '@browz/mcp'],
  env: { ...getDefaultEnvironment(), ...(process.env.BROWZ_DATA ? { BROWZ_DATA: process.env.BROWZ_DATA } : {}) },
  stderr: 'inherit',
});
const client = new Client({ name: 'browz-handoff-recipe', version: '1.0.0' });
await client.connect(transport);

async function tool(name, args, options = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000, ...options });
  const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text;
}
/** The JSON object at the start of a tool's text (browz_profile_create may add a note after it). */
function firstJson(text) {
  const start = text.indexOf('{');
  for (let end = text.length; end > start; end = text.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* try a shorter span */ }
  }
  throw new Error(`no JSON in: ${text.slice(0, 200)}`);
}
const log = (step, detail = '') => console.log(`${step.padEnd(22)} ${detail}`);

let id;
try {
  // 1. A profile of its own for this task, started with a window.
  id = firstJson(await tool('browz_profile_create', { name: `recipe-handoff-${Date.now()}` })).id;
  await tool('browz_profile_start', { id, headless: false });
  log('profile started', id);

  // 2. Open the page and read it.
  await tool('browz_navigate', { id, url: `${BASE}/login` });
  const before = await tool('browz_snapshot', { id });
  const needsPerson = /NEEDS A PERSON/i.test(before) || /"challenge"/.test(before);
  log('snapshot', needsPerson ? 'sign-in page detected: NEEDS A PERSON' : 'no challenge flagged');

  // 3. Hand the window to the person. This call waits until they finish (or timeoutSec passes);
  //    Browz pauses automation on the profile meanwhile, so the agent cannot watch or type.
  log('browz_request_human', 'waiting for the person to sign in in the Browz window…');
  const outcome = await tool('browz_request_human', {
    id,
    reason: 'Sign in to the demo shop, then click "I\'m done" in Browz',
    kind: 'login',
    timeoutSec: 300,
    doneWhenUrlContains: '/dashboard',
  }, {
    timeout: 320_000,                 // a little longer than timeoutSec
    resetTimeoutOnProgress: true,
    onprogress: (p) => log('  progress', p.message || `${p.progress}${p.total ? `/${p.total}` : ''}`),
  });
  log('handoff returned', outcome.split('\n')[0].slice(0, 160));

  // 4. Carry on in the same session: take a NEW snapshot (refs from before the handoff are stale).
  const after = await tool('browz_snapshot', { id });
  const signedIn = after.includes('Welcome back');
  log('snapshot after', signedIn ? 'signed in: "Welcome back"' : 'not signed in');
  process.exitCode = signedIn ? 0 : 1;
} catch (e) {
  // timed_out, cancelled and closed come back as tool errors with a sentence saying what to do.
  log('stopped', String(e.message || e));
  process.exitCode = 1;
} finally {
  if (id) await tool('browz_session_end', { id, delete: true }).catch(() => {});
  await client.close();
  site.close();
}
