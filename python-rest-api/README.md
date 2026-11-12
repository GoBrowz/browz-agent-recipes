# Python and the Local API, standard library only

Drive Browz from Python with nothing to install: every step is one HTTP call to the Browz agent on
your computer.

## What it does

`browz_rest.py` uses `urllib` to:

| Step | Route |
|---|---|
| create a profile | `POST /api/v1/profile/create` |
| start its browser | `POST /api/v1/browser/start` |
| open a page and wait for load | `POST /api/v1/browser/navigate` |
| read it as an accessibility outline with element refs | `POST /api/v1/browser/snapshot` |
| save a PNG | `POST /api/v1/browser/screenshot` |
| stop, then delete and purge | `POST /api/v1/browser/stop`, `/api/v1/profile/delete`, `/api/v1/profile/purge` |

To click and type, pass a ref from the snapshot (`e18`) to `POST /api/v1/browser/act`, as
[two-accounts-side-by-side](../two-accounts-side-by-side/) does. The full API is in the OpenAPI 3.1
file: [gobrowz.com/openapi/local-api.json](https://gobrowz.com/openapi/local-api.json).

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Python 3.9 or later.

The token is read from `~/.browz/api-token` and the port from `~/.browz/agent.json`
(`BROWZ_DATA`, `BROWZ_TOKEN`, `BROWZ_API=host:port` override them). Every route except
`GET /status` needs `Authorization: Bearer <token>`.

## Run it

```sh
cd python-rest-api
python3 browz_rest.py
python3 browz_rest.py --url https://example.org/ --out page.png --keep
```

## Expected output

```json
{
  "ok": true,
  "profileId": "p75f62c70094d068e",
  "debugPort": 62240,
  "url": "https://example.com/",
  "title": "Example Domain",
  "snapshotRefs": 2,
  "snapshotFirstLines": [
    "- document \"Example Domain\" [e2]",
    "  - text \"This domain is for use in documentation examples without needing permission. …\"",
    "  - link \"Learn more\" [e18]"
  ],
  "screenshot": "screenshot.png"
}
```

Run on 12 Nov 2026 with Python 3.9 against Browz 0.1.8 (headless agent, scratch data folder).

## Limits

- The Local API listens on loopback only (127.0.0.1); run the script on the same computer as Browz.
- Give a script less than the owner's token: a local agent key (`blcl_…`) limits it to some
  profiles, sites and scopes (Browz app: Settings › AI agents).
- Use it only on sites whose terms allow automated access. Browz does not solve CAPTCHAs.
