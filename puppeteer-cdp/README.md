# Puppeteer over CDP, attached to a Browz profile

Run existing Puppeteer code inside a Browz profile.

## What it does

`index.mjs` creates a throwaway profile (`POST /api/v1/profile/create`), starts it
(`POST /api/v1/browser/start`), connects with `puppeteer.connect({ browserWSEndpoint })`, opens a
page in the profile's first tab, saves `screenshot.png`, disconnects, stops the profile
(`POST /api/v1/browser/stop`) and deletes and purges it. `BROWZ_PROFILE_ID` uses one of your own
profiles instead (never deleted).

- `puppeteer.connect()`, never `puppeteer.launch()`.
- `defaultViewport: null` keeps the profile's own window size. Puppeteer's default resizes every
  page to 800x600, which changes what the page sees.
- `browser.disconnect()` leaves the browser to Browz, which stops it and saves the profile.

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Node.js 20 or later.

Credentials come from `~/.browz/api-token` and `~/.browz/agent.json` (`BROWZ_DATA`, `BROWZ_TOKEN`,
`BROWZ_API` override them).

## Run it

```sh
cd puppeteer-cdp
npm install
node index.mjs
```

## Expected output

```json
{"ok":true,"profileId":"p4346d6659e21c1a4","browser":"Chrome/156.0.8078.48","url":"https://example.com/","title":"Example Domain","screenshot":"screenshot.png"}
```

Run on 12 Nov 2026 against Browz 0.1.8 (headless agent, scratch data folder).

## Limits

- `puppeteer-core` is pinned to the reviewed version (25.5.0).
- `page.evaluate()` and `page.$()` run script in the page; prefer plain navigation and input where
  you can.
- Use it only on sites whose terms allow automated access. Browz does not solve CAPTCHAs.
