# TypeScript SDK: a profile behind a proxy, launched, screenshotted, stopped

The typed client, [`@browz/sdk`](https://www.npmjs.com/package/@browz/sdk), end to end.

## What it does

`index.ts`:

1. reads the Browz app's credentials with `localCredentials()`;
2. adds your proxy to the pool with `browz.proxies.create()` (the password is write-only);
3. creates a profile on it with `browz.profiles.create({ proxyId })`; its timezone and languages
   follow the proxy's exit;
4. starts it with `browz.browser.start()` and reports any `coherenceWarnings`;
5. opens a page with `browz.browser.navigate()`;
6. saves a screenshot through `POST /api/v1/browser/screenshot`, with the same credentials;
7. stops the profile, deletes and purges it, and removes the proxy it added.

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Node.js 22.18 or later (it runs `.ts` files directly), or compile with `tsc`.
- A proxy you are allowed to use, as a URL: `http://user:pass@host:port` (`https`, `socks4` and
  `socks5` work too). Without one, the profile runs on this computer's IP.

## Run it

```sh
cd typescript-sdk-proxy
npm install
npm run typecheck
BROWZ_PROXY='http://user:pass@proxy.example.net:8000' npm start
```

## Expected output

```json
{"ok":true,"profileId":"pc5bfdda6d583f4d9","archetype":"macos","proxyId":"px1dc03f2a77b3","cdpEndpoint":"http://127.0.0.1:63037","coherenceWarnings":[],"url":"https://example.com/","loaded":true,"screenshot":"screenshot.png"}
```

Run on 12 Nov 2026 against Browz 0.1.8 with `@browz/sdk` 0.2.0 from npm, through a local test proxy
(the proxy saw the profile's 17 HTTPS connections); `npm run typecheck` passes.

## Good to know

- A proxy is checked when the profile starts; a dead or refusing proxy makes the start fail with
  Browz's message (caught as `BrowzError`).
- `cdpEndpoint` is there for Playwright or Puppeteer (see [playwright-cdp](../playwright-cdp/)).
- Use it only on sites whose terms allow automated access. A person completes CAPTCHAs; Browz never solves them.
