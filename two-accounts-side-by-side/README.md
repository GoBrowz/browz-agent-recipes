# Two accounts, side by side, kept apart

Two Browz profiles sign in to the same site at the same time, each to its own account, and neither
sees the other's session. For people and agents that hold more than one account where the site
allows it: a business and a personal account, or one account per client you manage.

## What it does

`index.mjs` serves a small demo shop on `127.0.0.1` (a form that sets a session cookie, and an
account page), then:

1. creates two profiles, one per account (optionally each on its own proxy);
2. starts both;
3. signs each one in at the same time, the way a person would: `POST /api/v1/browser/snapshot` to
   read the form, `POST /api/v1/browser/act` to fill the field and click the button,
   `POST /api/v1/browser/wait` until the page says who is signed in;
4. opens the account page in both and checks that each still shows only its own account;
5. stops, deletes and purges both profiles.

No script runs in the page: snapshot reads the accessibility tree and act sends real input events.

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Node.js 20 or later. No packages to install.
- Optional: two proxies in your Browz pool (`BROWZ_PROXY_A`, `BROWZ_PROXY_B`, their pool ids).
  Without them both profiles share this computer's IP, which a site can use to link them.

## Run it

```sh
cd two-accounts-side-by-side
node index.mjs
BROWZ_PROXY_A=px… BROWZ_PROXY_B=px… node index.mjs
```

## Expected output

```json
{
  "ok": true,
  "site": "http://127.0.0.1:63852",
  "accounts": [
    { "profile": "p792b6d0b22982419", "expected": "alice", "title": "Account", "heading": "Signed in as alice" },
    { "profile": "p4f4f7fd8faf44a2f", "expected": "bob", "title": "Account", "heading": "Signed in as bob" }
  ]
}
```

Run on 12 Nov 2026 against Browz 0.1.8 (headless agent, scratch data folder).

## Limits

- **Only where the site allows it.** Many sites limit how many accounts one person may hold, or
  forbid automated sign-ups. Browz's acceptable use policy forbids creating accounts a platform
  forbids, fake-account networks, and returning to a service after a ban.
- Separate cookies and storage are guaranteed by the profile folders. Whether a site can still link
  two accounts depends on more than the browser: your IP (give each profile its own proxy), payment
  details, phone numbers and behaviour.
- To turn this into an agent task, use `browz_session_open` with a `persistent` mode and one
  `identity` per account over MCP: each identity returns to its own profile, cookies and proxy.
