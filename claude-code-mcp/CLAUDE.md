## Browsing with Browz

Use the Browz MCP tools (`browz_*`) for every web page in this project.

- One task, one isolated browser: start each task with `browz_session_open` (`task` says what you are
  doing; `mode` stays `ephemeral` unless the task names a returning identity) and end it with
  `browz_session_close`. Pass the returned `profileId` as `id` to the page tools. Never reuse another
  task's session.
- Read a page with `browz_snapshot` and act with `browz_act` on the refs it returns (`e12`). Take a new
  snapshot after every navigation. Use `browz_screenshot` only to check layout or images.
- If a snapshot says `NEEDS A PERSON` (a sign-in, a verification code or a CAPTCHA), call
  `browz_request_human` with a short reason and wait. Never type a password or code, and never try to
  solve a CAPTCHA.
- Only visit sites whose terms allow automated use. If a page says automated access is not allowed,
  stop and say so.
