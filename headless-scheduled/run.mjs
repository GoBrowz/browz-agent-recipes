// A scheduled, headless check: for each URL, open an isolated throwaway Browz session through the
// MCP server that `browz-mcp serve` runs, read the page, save a screenshot, and wipe the session.
//
//   npm install
//   BROWZ_MCP_TOKEN_FILE=~/.browz-mcp-token node run.mjs https://example.com/ https://example.org/
//
// Run it from cron, a systemd timer or launchd (files next to this one). Exits non-zero when any
// page fails, so the scheduler (or your alerting) sees it.
//
//   BROWZ_MCP_URL         MCP endpoint (default http://127.0.0.1:50334/mcp, what `serve` prints)
//   BROWZ_MCP_TOKEN_FILE  file holding the bearer token (or BROWZ_MCP_TOKEN with the token itself)
//   BROWZ_PROXY           none (default) | pool | a proxy id from browz_proxy_list
//   OUT_DIR               where screenshots and report.json go (default ./out)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.BROWZ_MCP_URL || 'http://127.0.0.1:50334/mcp';
const TOKEN = (process.env.BROWZ_MCP_TOKEN
  || (process.env.BROWZ_MCP_TOKEN_FILE ? await readFile(process.env.BROWZ_MCP_TOKEN_FILE, 'utf8') : '')).trim();
if (!TOKEN) throw new Error('set BROWZ_MCP_TOKEN_FILE (or BROWZ_MCP_TOKEN) to the bearer token `serve` uses');
const PROXY = !process.env.BROWZ_PROXY || process.env.BROWZ_PROXY === 'none' ? 'none'
  : process.env.BROWZ_PROXY === 'pool' ? 'pool' : { proxyId: process.env.BROWZ_PROXY };
const OUT_DIR = process.env.OUT_DIR || 'out';
const URLS = process.argv.slice(2).length ? process.argv.slice(2) : ['https://example.com/'];

const client = new Client({ name: 'browz-scheduled-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
}));

/** Call a Browz tool; a tool error becomes an exception carrying Browz's own message. */
async function tool(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`${name}: ${text}`);
  return { result, text };
}
/** The JSON object at the start of a tool's text (some tools add a note after it). */
function firstJson(text) {
  const start = text.indexOf('{');
  for (let end = text.length; end > start; end = text.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* shorter */ }
  }
  throw new Error(`no JSON in: ${text.slice(0, 200)}`);
}

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = { startedAt: new Date().toISOString(), mcp: MCP_URL, pages: [] };

for (const [i, url] of URLS.entries()) {
  const entry = { url, ok: false };
  let sessionId;
  try {
    // A fresh, isolated profile for this check; wiped by browz_session_close.
    const open = firstJson((await tool('browz_session_open', { task: `scheduled check of ${url}`, mode: 'ephemeral', proxy: PROXY, ttlMinutes: 30 })).text);
    sessionId = open.sessionId;
    const id = open.profileId;                       // the page tools take the profile id
    await tool('browz_navigate', { id, url });
    const snap = (await tool('browz_snapshot', { id, mode: 'compact', maxTokens: 1500 })).text;
    entry.title = /^Title: (.+)$/m.exec(snap)?.[1] ?? null;   // the snapshot starts with URL: and Title: lines
    entry.snapshotStart = snap.split('\n').slice(0, 6);
    const shot = (await tool('browz_screenshot', { id })).result.content.find((c) => c.type === 'image');
    if (shot) {
      entry.screenshot = join(OUT_DIR, `${stamp}-${i + 1}.png`);
      await writeFile(entry.screenshot, Buffer.from(shot.data, 'base64'));
    }
    entry.ok = true;
  } catch (e) {
    entry.error = String(e.message || e);
  } finally {
    if (sessionId) {
      const closed = await tool('browz_session_close', { sessionId }).catch((e) => ({ text: String(e.message) }));
      entry.cleanup = closed.text.includes('"cleaned"') ? 'cleaned' : closed.text.slice(0, 200);
    }
  }
  report.pages.push(entry);
}

await client.close();
report.ok = report.pages.every((p) => p.ok);
await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
