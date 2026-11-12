# Playwright over CDP, attached to a Browz profile

Keep your Playwright code; run it inside a Browz profile, with that profile's fingerprint, proxy,
cookies and storage.

## What it does

`index.mjs` creates a throwaway profile through the Local API (`POST /api/v1/profile/create`),
starts it (`POST /api/v1/browser/start`), attaches Playwright with `chromium.connectOverCDP()`,
opens a page, saves `screenshot.png`, detaches, stops the profile (`POST /api/v1/browser/stop`)
and deletes and purges it. Set `BROWZ_PROFILE_ID` to use one of your own profiles instead; it is
started and stopped, never deleted.

Two rules make the difference:

- **Attach, never launch.** `chromium.launch()` would start a different browser with none of the
  profile's state.
- **Use the existing context** (`browser.contexts()[0]`). It is the profile. `browser.newContext()`
  would be an empty, incognito-like context.

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Node.js 20 or later.

The script reads the app's Local API token from `~/.browz/api-token` and the port from
`~/.browz/agent.json` (`BROWZ_DATA` for another data folder; `BROWZ_TOKEN` and `BROWZ_API=host:port`
override both).

## Run it

```sh
cd playwright-cdp
npm install
node index.mjs
BROWZ_TEST_URL=https://example.org/ node index.mjs
```

## Expected output

```json
{"ok":true,"profileId":"p4c63aea92524310e","browser":"156.0.8078.48","url":"https://example.com/","title":"Example Domain","screenshot":"screenshot.png"}
```

Run on 12 Nov 2026 against Browz 0.1.8 (headless agent, scratch data folder).

## Good to know

- `playwright-core` is pinned to the version Browz reviews (1.61.1, see the automation
  compatibility contract).
- `page.evaluate()` runs script in the page. For reading and clicking, Playwright locators are
  fine; Browz's own `browz_snapshot`/`browz_act` (MCP) and `/api/v1/browser/snapshot`/`act` (REST)
  read and act without running any script in the page.
- Use it only on sites whose terms allow automated access. A person completes CAPTCHAs; Browz never solves them.
