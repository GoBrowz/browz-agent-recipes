# Cursor + Browz MCP

Let Cursor's agent open pages in an isolated Browz browser: check a local dev server, reproduce a
bug report, or read a page behind a sign-in you complete yourself.

## What it does

- `.cursor/mcp.json` adds the Browz MCP server to the project.
- `.cursor/rules/browz.mdc` is a project rule the agent picks up for any task that opens a web page:
  one `browz_session_open` session per task, `browz_snapshot` to read, `browz_act` to click and type,
  `browz_request_human` for sign-ins, `browz_session_close` at the end.

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)).
- Cursor, and Node.js 20 or later for `npx`. Without Node, set `command` to the binary inside the
  app (`/Applications/Browz.app/Contents/Resources/browz-mcp` on macOS) and `args` to `[]`.

## Run it

1. Copy the `.cursor` folder into your project's root (merge it with an existing one).
2. In Cursor, open *Settings › MCP* and check that `browz` is listed and enabled. The first start
   downloads `@browz/mcp` from npm.
3. In the agent chat, ask for example:

   > Start my dev server, then use Browz to open http://localhost:3000, click "Sign up", and tell me
   > whether the form shows an error for an empty email. Take a screenshot.

`npx -y @browz/mcp setup cursor --write` writes the same server entry into Cursor's global config
instead (it keeps your other servers and saves the old file next to it).

## Expected output

The agent lists the Browz tools in its tool calls (`browz_session_open`, `browz_navigate`,
`browz_snapshot`, `browz_act`, `browz_screenshot`, `browz_session_close`) and answers with what the
page showed, plus the screenshot.

## Limits

- Not run inside Cursor by us. The config is the standard MCP `mcpServers` shape that Cursor
  documents, and the same server command was run end to end with Claude Code
  ([claude-code-mcp](../claude-code-mcp/)).
- The plan's cap on sessions at once applies (Free 2). Close sessions when the task is done.
- Browz does not solve CAPTCHAs; use only sites whose terms allow automated access.
