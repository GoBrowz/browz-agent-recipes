# Stored sign-in: the agent signs in, the password stays in Browz

An AI agent signs in to a site with a username, password and one-time code that you stored in Browz.
Browz types each value into the page itself; the agent gets back only "filled". The password, the
code and the TOTP seed never reach the agent, its model or its logs.

## What it does

- `demo-site.mjs` is a small sign-in site that runs on your computer: username and password, then a
  verification code from an authenticator (TOTP), then a page that says "Signed in as demo-user". Each
  start makes a fresh random password and TOTP seed and writes them to a file only you can read, ready
  for `browz credential add --password-stdin`.
- You store the sign-in in Browz for that site and one profile, and create a **local agent key** that
  may use stored sign-ins on that profile and that site only.
- `agent.mjs` is the agent: a small MCP client (the official `@modelcontextprotocol/sdk`) that runs the
  local Browz MCP server with the key. It opens the sign-in page, calls `browz_credential_list` (ids,
  labels and a masked username), fills the username and password with `browz_credential_fill`, tries
  to read the password back (the snapshot shows `[value=<redacted>]` and `browz_screenshot` is
  refused), signs in, fills the code with `browz_credential_fill` and `field: "totp"`, and checks the
  page says "Signed in as demo-user".
- `claude-code/` does the same with Claude Code as the agent: `.mcp.json` passes the key to the Browz
  MCP server, `CLAUDE.md` tells Claude to sign in only with stored sign-ins, and `prompt.txt` is the task.
- `try-it.sh` runs every step below in one go, shows what the logs recorded, checks that neither the
  password nor the seed appears anywhere in what the agent received, and revokes the key. It then
  removes the demo profile and the stored sign-in (`KEEP=1` keeps them).

## Prerequisites

- The Browz app, installed and open ([gobrowz.com/download](https://gobrowz.com/download)), and its
  `browz` command (or set `BROWZ` to it).
- Node.js 20 or later.
- For the Claude Code variant: [Claude Code](https://docs.claude.com/en/docs/claude-code).

## Run it

```sh
cd stored-sign-in
npm install
./try-it.sh                 # agent.mjs is the agent
AGENT=claude ./try-it.sh    # Claude Code is the agent
```

Or step by step, in two terminals:

```sh
# Terminal 1: the demo site. It prints its address and where it wrote the secrets.
node demo-site.mjs

# Terminal 2
URL=http://127.0.0.1:<port>                      # as demo-site.mjs printed it
SECRETS=<secrets file>                           # as demo-site.mjs printed it
PROFILE=$(browz --json create signin-demo | node -p 'JSON.parse(require("fs").readFileSync(0))[0].id')

# Store the sign-in for this profile and this site. The password and seed come from stdin
# (or leave out --password-stdin and type them at the hidden prompt).
browz credential add --label "Demo site" --site "$URL" --username demo-user \
  --profile "$PROFILE" --totp --password-stdin < "$SECRETS"
rm "$SECRETS"

# A key for the agent: this profile, this site, and permission to use stored sign-ins.
(umask 077; browz agent-token create --name signin-demo --profiles "$PROFILE" --sites "${URL#http://}" \
  --scopes browz:profiles:read,browz:profiles:write,browz:browser,browz:credentials:use --days 1 > agent-key)

BROWZ_LOCAL_AGENT_TOKEN_FILE=$PWD/agent-key DEMO_URL="$URL" PROFILE="$PROFILE" node agent.mjs

browz agent-token log --agent la_…               # the key's own log
browz json GET /api/v1/log/list                  # the local action log: credential.fill rows
browz agent-token revoke la_…
rm agent-key
```

For Claude Code, run `claude` in `claude-code/` with `BROWZ_AGENT_KEY_FILE` set to the key file, approve
the `browz` server, and give it the task in `prompt.txt` with your profile id and the site's address.

## Expected output

`./try-it.sh`, with ids shortened:

```text
== 1. the demo site (on your computer only)
site          http://127.0.0.1:54892
== 2. a profile for the agent
profile       p9853f5…
== 3. store the sign-in in Browz: password and TOTP seed from stdin, never the command line
cred_a01c88…  Demo site     d•••r     profile:p9853f5…  totp  http://127.0.0.1:54892
== 4. a local agent key: this profile only, this site only, may use stored sign-ins
agent key     la_2c020b… (the key itself is in a file only you can read)
== 5. the agent signs in
snapshot                 SAVED SIGN-IN: This page asks someone to sign in, and a saved sign-in for this site is available to you: "Demo site" (credentialId cred_a01c88…). Fill it with browz_credential_fill (…); you never see the values. …
browz_credential_list    what the agent receives:
    [
      {
        "custody": "install-key",
        "fields": [],
        "hasTotp": true,
        "id": "cred_a01c88…",
        "label": "Demo site",
        "scope": { "id": "p9853f5…", "kind": "profile" },
        "sites": [ "http://127.0.0.1:54892" ],
        "usernameHint": "d•••r",
        …
      }
    ]
fill username            { "credentialId": "cred_a01c88…", "field": "username", "filled": true, "origin": "http://127.0.0.1:54892", "submitted": false }
fill password            { "credentialId": "cred_a01c88…", "field": "password", "filled": true, "origin": "http://127.0.0.1:54892", "submitted": false }
snapshot (password)      - textbox "Password" [e7] [value=<redacted>] [focused]
browz_screenshot         refused: Error: refused: browz_screenshot is blocked on this profile while a password or code that Browz filled is still in a page (1 field in an open tab). Navigate that tab to another page or reload it (browz_navigate), or close it, and try again; browz_snapshot still works and hides the filled value.
fill totp                { "credentialId": "cred_a01c88…", "field": "totp", "filled": true, "origin": "http://127.0.0.1:54892", "submitted": true }
result                   Signed in as demo-user
== 6. what the log recorded (the field, never the value)
65 2026-11-13T00:58:09Z signin-demo  ok  browz_credential_fill POST /api/v1/credential/fill http://127.0.0.1:54892/account (filled)
58 2026-11-13T00:58:03Z signin-demo  ok  browz_credential_fill POST /api/v1/credential/fill http://127.0.0.1:54892/login (filled)
57 2026-11-13T00:58:00Z signin-demo  ok  browz_credential_fill POST /api/v1/credential/fill http://127.0.0.1:54892/login (filled)
2026-11-13T00:58:02Z credential.fill credential=cred_a01c88… field=username origin=http://127.0.0.1:54892 outcome=filled agent=la_2c020b…
2026-11-13T00:58:07Z credential.fill credential=cred_a01c88… field=password origin=http://127.0.0.1:54892 outcome=filled agent=la_2c020b…
2026-11-13T00:58:11Z credential.fill credential=cred_a01c88… field=totp origin=http://127.0.0.1:54892 outcome=filled agent=la_2c020b…
== 7. did the password or seed reach the agent?
no: neither appears in anything the agent received
== 8. revoke the key; the agent is refused from now on
revoked       la_2c020b…
stopped                  browz_profile_start: Error: unauthorized: this agent token was revoked by the owner
```

With `AGENT=claude`, step 5 lists Claude Code's tool calls and its answer:

```text
tool call    browz_profile_start {"id":"pce6102…"}
tool call    browz_credential_list {"id":"pce6102…"}
tool call    browz_navigate {"id":"pce6102…","url":"http://127.0.0.1:55488/login"}
tool call    browz_snapshot {"id":"pce6102…"}
tool call    browz_credential_fill {"id":"pce6102…","credentialId":"cred_df48bb…","ref":"e2","field":"username"}
tool call    browz_credential_fill {"id":"pce6102…","credentialId":"cred_df48bb…","ref":"e7","field":"password","submit":true}
tool call    browz_snapshot {"id":"pce6102…"}
tool call    browz_credential_fill {"id":"pce6102…","credentialId":"cred_df48bb…","ref":"e29","field":"totp","submit":true}
tool call    browz_snapshot {"id":"pce6102…"}
tool call    browz_profile_stop {"id":"pce6102…"}
Claude Code  I signed in, and the page I reached is headed **"Signed in as demo-user"** … I used the sign-in stored in Browz as "Demo site". Browz typed the username and password, then the verification code the site asked for next.
```

Run on 13 Nov 2026 against Browz 0.1.9 (the agent and MCP server from the macOS app, headless, with a
scratch data folder), three times with `agent.mjs` and once with Claude Code; the full transcript of
each run, tool results included, held neither the password nor the seed.

## Good to know

- A stored sign-in works only where you said: on the sites you list with `--site` (over https, or
  `http://` on your own computer as here), on the profiles its scope names (`--profile`, `--group` or
  `--any`), and for a key, also inside the key's own profiles and allowed sites.
- Browz types a password or code only into a password field, and a code also into a field marked
  `autocomplete="one-time-code"`, as the demo's code field is. Browz computes each code at the moment
  of the fill from the stored seed.
- While a filled secret is in a page, snapshots show `[value=<redacted>]`, and screenshots, script
  and text waits on that profile are refused. Loading the next page (submitting the form) lifts this.
- Each fill is one row in the local action log (`credential.fill`: credential, field, origin, outcome,
  key) and one in the key's own log, always without the value. Each credential allows 12 fills in any
  10 minutes.
- `browz_profile_start` needs `browz:profiles:write`; with `--profiles <id>` the key reaches that one
  profile only. Revoke the key when the job is done, or give it a short life with `--days`.
- For a page with no stored sign-in, or a CAPTCHA, the agent hands the window to you with
  `browz_request_human` ([human-handoff](../human-handoff/)). A person completes CAPTCHAs; Browz never
  solves them.
- Store sign-ins only for sites whose terms allow automated access, and only for your own accounts.
