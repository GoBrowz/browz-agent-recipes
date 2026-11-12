# Human in the loop: the agent asks you to sign in, then carries on

An agent meets a sign-in page, a verification code or a CAPTCHA. You handle it: the agent hands the
live Browz window to you with `browz_request_human`, waits, and continues in the same session once
you are done. Your password stays with you.

## What it does

`index.mjs` is a small MCP client (the official `@modelcontextprotocol/sdk`) that runs the local
Browz MCP server over stdio and plays the agent's part against a demo sign-in page it serves on
`127.0.0.1`:

1. `browz_profile_create`, then `browz_profile_start` with `headless: false` (you need a window);
2. `browz_navigate` to the sign-in page and `browz_snapshot`: Browz flags it with `NEEDS A PERSON`;
3. `browz_request_human` with a reason, `kind: "login"`, `timeoutSec: 300` and
   `doneWhenUrlContains: "/dashboard"`. Browz pauses automation on the profile, brings its window to
   the front, shows a notification and a banner with **I'm done** and **Cancel**. The call waits,
   sending progress, until you finish;
4. a new `browz_snapshot`: the agent is signed in ("Welcome back") without ever seeing the password;
5. `browz_session_end` with `delete: true`. That moves the demo profile to the trash, where it stays
   (restorable) until you empty the trash in Browz; see
   "Throwaway profiles and the trash" in `docs/agents/sessions.md`.

The same flow works with any MCP agent: tell it "if a snapshot says NEEDS A PERSON, call
browz_request_human" (see the `CLAUDE.md` in [claude-code-mcp](../claude-code-mcp/)).

## Prerequisites

- The Browz app, installed and open, on the computer you are sitting at
  ([gobrowz.com/download](https://gobrowz.com/download)).
- Node.js 20 or later.

## Run it

```sh
cd human-handoff
npm install
node index.mjs
```

A Browz window opens on the demo sign-in page. Type any email and password and press **Sign in**
(the demo accepts anything). Reaching `/dashboard` ends the handoff by itself; on a real site, click
**I'm done** in the Browz banner.

## Expected output

```text
profile started        p140cfb817b0f49b9
snapshot               sign-in page detected: NEEDS A PERSON
browz_request_human    waiting for the person to sign in in the Browz window…
  progress             Waiting for the person (300 s left): Sign in to the demo shop, then click "I'm done" in Browz
handoff returned       The person finished: the page reached the agreed URL. The agent has control again, in the same session. …
snapshot after         signed in: "Welcome back"
```

Run on 12 Nov 2026 against Browz 0.1.8 on a Mac with a window; the sign-in was typed into the tab by
a test stand-in for the person.

## Good to know

- Hand-offs use a profile with a window. For a headless profile (and every profile under
  `browz-mcp serve`) the call answers "this profile is running headless, so nobody can see its window".
- If nobody finishes within `timeoutSec`, the call ends as an error (`timed_out`); **Cancel** ends it
  as `cancelled`. Ask again or end the session.
- Over the hosted server (`mcp.gobrowz.com`) one call waits about 70 s and returns
  `state: "waiting"` with a `handoffId`; call again with it to keep waiting.
- Your passwords and codes stay in Browz: the agent never sees them. A person completes CAPTCHAs; Browz never solves them. For sign-ins
  you want automated, store them in Browz and let the agent fill them by reference with
  `browz_credential_fill`; the secret stays in Browz.
