// The TypeScript SDK: add a proxy, create a profile behind it, launch it, take a screenshot, stop.
//
//   npm install
//   BROWZ_PROXY='http://user:pass@proxy.example.net:8000' npm start
//   npm run typecheck
//
// BROWZ_PROXY is any proxy you are allowed to use: http, https, socks4 or socks5. Without it the
// profile runs direct (this machine's IP), which links it to every other unproxied profile.
import { writeFile } from 'node:fs/promises';
import { Browz, BrowzError, localCredentials, type ProxyScheme } from '@browz/sdk';

const URL_TO_OPEN = process.env.BROWZ_TEST_URL ?? 'https://example.com/';

/** `scheme://user:pass@host:port` → the SDK's ProxySpec. */
function parseProxy(raw: string) {
  const u = new URL(raw);
  const scheme = u.protocol.replace(':', '') as ProxyScheme;
  if (!['http', 'https', 'socks4', 'socks5'].includes(scheme)) throw new Error(`unsupported proxy scheme ${scheme}`);
  return {
    scheme,
    host: u.hostname,
    port: Number(u.port),
    ...(u.username ? { user: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { pass: decodeURIComponent(u.password) } : {}),
  };
}

// Reads the Browz app's own Local API token (<BROWZ_DATA or ~/.browz>/api-token) and port.
const creds = await localCredentials();
const browz = new Browz(creds);

// 1. A pool proxy. Its id is what profiles (and the MCP tools) refer to; the password is
//    write-only and never returned by any list.
let proxyId: string | undefined;
if (process.env.BROWZ_PROXY) {
  proxyId = (await browz.proxies.create({ name: `recipe-proxy-${Date.now()}`, ...parseProxy(process.env.BROWZ_PROXY) })).id;
} else {
  console.error('BROWZ_PROXY is not set: this profile will use this machine\'s own IP.');
}

// 2. A profile behind it. Timezone and languages follow the proxy's exit unless you set them.
const profile = await browz.profiles.create({ name: `recipe-sdk-${Date.now()}`, ...(proxyId ? { proxyId } : {}) });

let started = false;
try {
  // 3. Launch. coherenceWarnings flags anything that contradicts the exit (e.g. a timezone).
  const session = await browz.browser.start(profile.id);
  started = true;

  // 4. Open a page through the agent and wait for it to load.
  const nav = await browz.browser.navigate(profile.id, URL_TO_OPEN);

  // 5. Screenshot. The published SDK (0.2.0) has no wrapper for it yet, so this is the Local API route
  //    itself (POST /api/v1/browser/screenshot, PNG as base64), with the same credentials.
  //    @browz/sdk 0.3.0 adds browser.snapshot/act/wait/screenshot; this recipe switches to them
  //    once 0.3.0 is on npm.
  const res = await fetch(`http://${creds.host}/api/v1/browser/screenshot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profile.id }),
  });
  const shot = (await res.json()) as { code: number; msg?: string; data?: { base64: string } };
  if (!res.ok || shot.code !== 0 || !shot.data) throw new Error(`screenshot: ${shot.msg ?? res.status}`);
  await writeFile('screenshot.png', Buffer.from(shot.data.base64, 'base64'));

  console.log(JSON.stringify({
    ok: true,
    profileId: profile.id,
    archetype: profile.archetype,
    proxyId: proxyId ?? null,
    cdpEndpoint: session.cdpEndpoint,
    coherenceWarnings: session.coherenceWarnings ?? [],
    url: nav.url,
    loaded: nav.loaded,
    screenshot: 'screenshot.png',
  }));
} catch (e) {
  // BrowzError carries the agent's own message and HTTP status.
  if (e instanceof BrowzError) console.error(`Browz refused: ${e.message} (HTTP ${e.status})`);
  throw e;
} finally {
  // 6. Stop (saves the profile cleanly), then remove what this recipe made.
  if (started) await browz.browser.stop(profile.id);
  await browz.profiles.delete(profile.id);
  await browz.profiles.purge(profile.id);
  if (proxyId) await browz.proxies.delete(proxyId);
}
