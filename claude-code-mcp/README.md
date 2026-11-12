# Claude Code + Browz MCP: one isolated browser per task

Give Claude Code a real browser for each task it does, with its own fingerprint, cookies and
storage, wiped when the task ends.

## What it does

- `.mcp.json` adds the Browz MCP server to this project (Claude Code reads it from the project root).
- `CLAUDE.md` tells Claude Code how to browse: open a `browz_session_open` session per task, read with
  `browz_snapshot`, act with `browz_act`, hand sign-ins to you with `browz_request_human`, and close
  the session with `browz_session_close`.
- `try-it.sh` runs a sample prompt non-interactively, with only the Browz tools allowed.

Copy `.mcp.json` and the `CLAUDE.md` section into your own project, or add the server for every
project with:

```sh
claude mcp add browz -- npx -y @browz/mcp
```

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)). The MCP
  server reads the app's own Local API token from its data folder, so no token goes in any config.
- [Claude Code](https://docs.claude.com/en/docs/claude-code) and Node.js 20 or later (for `npx`).
  Without Node, point `command` at the binary inside the app instead, e.g.
  `/Applications/Browz.app/Contents/Resources/browz-mcp` on macOS.

## Run it

```sh
cd claude-code-mcp
./try-it.sh
```

Or open Claude Code in this folder (`claude`), approve the `browz` server when asked, and type the
prompt in `prompt.txt`:

> Using Browz, in one isolated session of its own: open https://example.com, tell me the page title
> and the text of its only link, take a screenshot, then close the session.

## Expected output

Claude Code calls `browz_session_open`, `browz_navigate`, `browz_snapshot`, `browz_screenshot` and
`browz_session_close`, then answers along these lines:

```text
- Page title: Example Domain
- Link text: "Learn more" (the only link on the page)
- Screenshot: shows the "This domain is for use in documentation examples…" notice
- Session: ephemeral session as_…, profile p…; closed, and Browz reported the profile cleaned up.
```

Verified on 12 Nov 2026 with Claude Code 2.1 and Browz 0.1.8 (the server bundled in the app,
against a scratch data folder).

## Limits

- Sessions at once are capped by your plan (Free 2, Pro 20 5, and so on; see
  [sessions](https://gobrowz.com/docs/ai-agents)). Close sessions you are done with; an ephemeral
  session left open is wiped after `ttlMinutes` (default one day).
- A session with no proxy uses this computer's IP. Pass `"proxy": "pool"` (or a `proxyId`) to
  `browz_session_open` to give each task its own exit.
- Browz does not solve CAPTCHAs. When a page asks for a person, the agent hands the window to you.
- Use it only on sites whose terms allow automated access.
