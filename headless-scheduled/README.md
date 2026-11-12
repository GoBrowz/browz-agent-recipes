# A scheduled headless run on a server

Run Browz on a server with no desktop, and let a scheduled job open a fresh isolated browser for
each page it checks.

## What it does

- `browz-mcp serve` (part of Browz) starts the Browz agent with headless profiles and serves MCP over
  Streamable HTTP at `http://127.0.0.1:50334/mcp`, behind a bearer token.
- `run.mjs` connects with the official MCP client, and for each URL on its command line:
  `browz_session_open` (an ephemeral session: a new profile with its own fingerprint and storage),
  `browz_navigate`, `browz_snapshot`, `browz_screenshot` (saved to `out/`), then
  `browz_session_close`, which wipes the profile. It writes `out/report.json` and exits non-zero if
  any page failed.
- `schedule/` has the same job for cron, a systemd timer and a macOS LaunchAgent.

## Prerequisites

- The Browz binaries on the server: on macOS the app bundle
  (`/Applications/Browz.app/Contents/Resources/browz-mcp`; the app need not be open); on Linux x64
  the agent and engine package or the Docker image (see the headless guide,
  [gobrowz.com/docs/ai-agents](https://gobrowz.com/docs/ai-agents)). Run it as an ordinary user, never
  root.
- Node.js 20 or later for `run.mjs`.
- About 0.25 GB of memory per open session, plus 1 GB.

## Run it

```sh
# 1. A bearer token, readable by you only.
umask 077; openssl rand -hex 32 > ~/.browz-mcp-token

# 2. The headless agent (keep it running: a systemd service, a LaunchAgent, or Docker).
BROWZ_MCP_TOKEN_FILE=~/.browz-mcp-token /Applications/Browz.app/Contents/Resources/browz-mcp serve
#    Linux: BROWZ_MCP_TOKEN_FILE=… BROWZ_CHROMIUM_BINARY=/opt/browz-engine/…/chrome /opt/browz/bin/browz-mcp serve

# 3. The check.
cd headless-scheduled
npm install
BROWZ_MCP_TOKEN_FILE=~/.browz-mcp-token node run.mjs https://example.com/ https://example.org/

# 4. Schedule it: schedule/crontab.txt, schedule/browz-check.{service,timer}, or the LaunchAgent plist.
```

`BROWZ_PROXY=pool` gives each session the least-used proxy from the pool (`BROWZ_PROXY=<id>` a
particular one). The pool is managed with the Local API (`POST /api/v1/proxy/create`).

## Expected output

```json
{
  "startedAt": "2026-11-12T12:56:42.001Z",
  "mcp": "http://127.0.0.1:51991/mcp",
  "pages": [
    {
      "url": "https://example.com/",
      "ok": true,
      "title": "Example Domain",
      "snapshotStart": ["URL: https://example.com/", "Title: Example Domain", "Mode: compact (about 59 tokens, 2 refs)", "", "- document \"Example Domain\" [e2]", "…"],
      "screenshot": "out/2026-11-12T12-56-42-000Z-1.png",
      "cleanup": "cleaned"
    }
  ],
  "ok": true
}
```

Run on 12 Nov 2026 against `browz-mcp serve` from Browz 0.1.8 on macOS (scratch data folder, two
URLs, both sessions `cleaned`). The systemd units were checked with `systemd-analyze verify` on
Ubuntu 24.04; the plist with `plutil -lint`.

## Limits

- Headless profiles cannot hand a window to a person: there is no `browz_request_human` here. A
  task that needs a sign-in should use a persistent identity signed in beforehand, or a stored
  sign-in (`browz_credential_fill`).
- `serve` listens on loopback. To reach it from other machines, put a TLS reverse proxy in front and
  pass `--allowed-host <name>`; never serve plain HTTP beyond the machine.
- Not signed in to a Browz account, the local agent has no session cap and nothing is metered.
  Signed in, the plan's cap on sessions at once applies (Free 2, Pro 20 5, …).
- Give scheduled jobs their own local agent key (`browz-mcp agent-token create --profiles own …`)
  instead of the server's token.
- Use it only on sites whose terms allow automated access. Browz does not solve CAPTCHAs.
