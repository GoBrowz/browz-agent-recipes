# Browz agent recipes

Copy-paste examples for people building AI agents and automation on [Browz](https://gobrowz.com).
Each profile in Browz is an isolated browser with its own fingerprint, proxy, cookies and storage;
these recipes show the ways in: the MCP server, the hosted MCP server, the Local API (REST,
OpenAPI 3.1), the TypeScript SDK, and CDP for Playwright and Puppeteer.

Every folder is a small complete project with its own README: what it does, prerequisites, how to run
it, the output to expect, and what is good to know.

| Recipe | Shows | Uses | Checked |
|---|---|---|---|
| [claude-code-mcp](claude-code-mcp/) | Claude Code with one isolated, wiped browser per task | local MCP (stdio), `browz_session_open` | ran (Claude Code 2.1) |
| [cursor-mcp](cursor-mcp/) | Cursor's agent opening pages in Browz, with a project rule | local MCP (stdio) | config only |
| [openai-agents-hosted-mcp](openai-agents-hosted-mcp/) | An OpenAI Agents SDK agent on the hosted server with an agent token | hosted MCP (Streamable HTTP) | ran `--no-llm` against `serve` |
| [playwright-cdp](playwright-cdp/) | Existing Playwright code inside a Browz profile | Local API + CDP | ran |
| [puppeteer-cdp](puppeteer-cdp/) | Existing Puppeteer code inside a Browz profile | Local API + CDP | ran |
| [typescript-sdk-proxy](typescript-sdk-proxy/) | A profile behind a proxy: create, launch, screenshot, stop | `@browz/sdk` | ran, type-checked |
| [python-rest-api](python-rest-api/) | The whole loop from Python with the standard library | Local API (REST) | ran |
| [two-accounts-side-by-side](two-accounts-side-by-side/) | Two accounts a site allows, signed in at once, kept apart | Local API snapshot + act | ran |
| [human-handoff](human-handoff/) | The agent hands the window to you for a sign-in, then carries on | local MCP, `browz_request_human` | ran (headed Mac) |
| [headless-scheduled](headless-scheduled/) | A scheduled job on a server: one wiped session per page | `browz-mcp serve`, cron/systemd/launchd | ran |

"Ran" means the recipe was run end to end against Browz 0.1.8 on 12 Nov 2026, against a scratch data
folder, using only our own demo pages, `example.com` and `example.org`.

## Before you start

- Install Browz and open it: [gobrowz.com/download](https://gobrowz.com/download). The Local API and
  the local MCP server read the app's own token from its data folder (`~/.browz/api-token`), so no
  recipe asks you to paste a token. The headless recipe uses `browz-mcp serve` instead of the app.
- Reference: the MCP tool list ([gobrowz.com/mcp/tools.json](https://gobrowz.com/mcp/tools.json)), the
  Local API ([gobrowz.com/openapi/local-api.json](https://gobrowz.com/openapi/local-api.json)) and the
  agent guide ([gobrowz.com/docs/ai-agents](https://gobrowz.com/docs/ai-agents)).

## Use them responsibly

- Use Browz only where each site's terms allow it, and within Browz's acceptable use policy
  ([gobrowz.com/acceptable-use](https://gobrowz.com/acceptable-use)): no fraud, no accounts a
  platform forbids, no returning after a ban, no fake engagement.
- A person completes CAPTCHAs; Browz never solves them. Your passwords and codes stay in Browz and
  the agent never sees them. When a page needs a person, the agent asks you ([human-handoff](human-handoff/)).
- Give each agent its own local agent key with only the scopes, profiles and sites it needs, rather
  than the owner's token.

## Questions and issues

Open an issue in this repository, or reach Browz support from the app (Settings › Help and support)
or [gobrowz.com/help](https://gobrowz.com/help.html#contact). Each recipe folder is
self-contained: copy one into your own project and change it as you like.

## Licence

MIT. See [LICENSE](LICENSE).
