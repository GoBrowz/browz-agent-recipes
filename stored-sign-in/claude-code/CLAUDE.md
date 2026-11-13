## Signing in with Browz

Use the Browz MCP tools (`browz_*`) for every web page in this project.

- Read a page with `browz_snapshot` and act with `browz_act` on the refs it returns (`e12`). Take a new
  snapshot after every navigation.
- To sign in, use a sign-in the person stored in Browz. A snapshot of a sign-in page names it
  (`SAVED SIGN-IN: …`); `browz_credential_list` with the profile `id` lists every one this profile may
  use. Fill each field with `browz_credential_fill`: its `credentialId`, the field's ref, and `field`
  `username`, `password` or `totp` (for a verification code). Pass `submit: true` on the last field of
  a form. Browz types the value and tells you only that it was filled.
- Never type, guess or ask for a password or code yourself. If no stored sign-in fits the page, call
  `browz_request_human` with a short reason and wait.
- While a filled password is in a page, screenshots are refused and snapshots show it as
  `[value=<redacted>]`. Submitting the form loads the next page and lifts that.
