# OpenAI Agents SDK + hosted Browz MCP (agent token)

A cloud or server-side agent built with the [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/mcp/)
drives a Browz profile on your computer through the hosted MCP server, `https://mcp.gobrowz.com/mcp`,
authenticated with a Browz agent token.

## What it does

`main.py` connects `MCPServerStreamableHttp` to the hosted server with
`Authorization: Bearer $BROWZ_AGENT_TOKEN`, gives the Browz tools to an `Agent`, and runs a task:
create a profile, start it, open https://example.com, report the title, take a screenshot, end the
session and delete the profile. `--no-llm` does the same steps as direct tool calls, so you can
check the wiring without a model key.

The hosted server relays each call to the Browz app on your computer. The browser is your real
profile there (same engine, fingerprint, proxy and storage); nothing runs in a hosted browser.

## Prerequisites

- The Browz app on your computer: open, signed in, with Settings › Account › **Remote control** on.
  Remote control needs a hardware security chip (Apple silicon or a T2 Mac, or TPM 2.0 on Windows
  and Linux).
- A Browz **agent token**: in the app, *Automate › Connect an AI agent*, or on your account page.
  It is shown once. Keep it in the environment, never in code.
- [uv](https://docs.astral.sh/uv/) (or Python 3.10+ with `pip install openai-agents`).
- `OPENAI_API_KEY` for the model (not needed with `--no-llm`).

## Run it

```sh
cd openai-agents-hosted-mcp
uv sync
export BROWZ_AGENT_TOKEN=...        # from your secret store
uv run main.py --no-llm            # the Browz steps only
export OPENAI_API_KEY=...
uv run main.py                     # the agent does the task
```

With more than one computer online, set `BROWZ_DEVICE_ID` (from the `browz_devices_list` tool).

`BROWZ_MCP_URL` points the same code at any Browz Streamable HTTP endpoint, for example a
[`browz-mcp serve`](../headless-scheduled/) on your own server, with its bearer token as
`BROWZ_AGENT_TOKEN`.

## Expected output

```json
{
  "ok": true,
  "mcp": "https://mcp.gobrowz.com/mcp",
  "tools": 17,
  "profileId": "p…",
  "title": "Example Domain",
  "screenshotBytes": 160989
}
```

With the model, the last field is `"answer"`, e.g. "The page title is Example Domain. I took a
screenshot, ended the session and deleted the profile."

How this was checked (12 Nov 2026): `--no-llm` ran end to end through `MCPServerStreamableHttp`
against Browz 0.1.8's `browz-mcp serve` over HTTP with a bearer token (`"tools": 39` there, the
local server's count). It was not run against the hosted server itself, and the model path was not
run; it is the SDK's standard `Agent` + `Runner` usage.

## Limits

- The hosted server is a free public beta. Without a paid plan an account gets 2 hosted sessions at
  once, 2,000 actions and 300 relay minutes a month, and 30 tool calls a minute per connection.
  When a limit is hit, the tool result says how long to wait.
- Remote tools leave out cookies, JavaScript (`browz_evaluate`) and downloads, and
  `browz_session_open` is local only; this recipe uses only tools the remote server offers.
- Page snapshots, screenshots and typed text pass through our server encrypted and are deleted after
  7 days; the action log (tool, profile, page origin and path, outcome) is kept 90 days.
- Browz does not solve CAPTCHAs. Use it only where each site's terms allow automated access.
