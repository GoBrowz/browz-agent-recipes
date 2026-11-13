// The agent's side: sign in to the demo site with a password and one-time code stored in Browz,
// without ever seeing either. A small MCP client (the official @modelcontextprotocol/sdk) runs the
// local Browz MCP server over stdio with a local agent key, so every call runs as that key: its
// scopes, its one profile and its allowed sites.
//
//   BROWZ_LOCAL_AGENT_TOKEN_FILE=./agent-key DEMO_URL=http://127.0.0.1:<port> PROFILE=<id> node agent.mjs
//
//   BROWZ_LOCAL_AGENT_TOKEN_FILE  file holding the agent key (from `browz agent-token create`)
//   DEMO_URL                      the demo site's address (demo-site.mjs prints it)
//   PROFILE                       the profile the key may use
//   BROWZ_MCP                     the browz-mcp binary (default: npx -y @browz/mcp, which finds the app's)
//   SHOW_WINDOW=1                 start the profile with a window (default: headless)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const { DEMO_URL, PROFILE: id, BROWZ_LOCAL_AGENT_TOKEN_FILE: keyFile } = process.env;
if (!DEMO_URL || !id || !keyFile) {
  console.error('Set DEMO_URL, PROFILE and BROWZ_LOCAL_AGENT_TOKEN_FILE (see README.md).');
  process.exit(2);
}

// The key reaches the MCP server through its environment, as a file name; never on a command line.
const env = { ...getDefaultEnvironment(), BROWZ_LOCAL_AGENT_TOKEN_FILE: keyFile };
if (process.env.BROWZ_DATA) env.BROWZ_DATA = process.env.BROWZ_DATA;
const transport = new StdioClientTransport({
  command: process.env.BROWZ_MCP || 'npx',
  args: process.env.BROWZ_MCP ? [] : ['-y', '@browz/mcp'],
  env,
  stderr: 'inherit',
});
const client = new Client({ name: 'browz-stored-sign-in-recipe', version: '1.0.0' });
await client.connect(transport);

/** Call a tool; resolves to { ok, text } so the refusals can be shown too. */
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { ok: !result.isError, text };
}
async function tool(name, args) {
  const r = await call(name, args);
  if (!r.ok) throw new Error(`${name}: ${r.text}`);
  return r.text;
}
const log = (step, detail = '') => console.log(`${step.padEnd(24)} ${detail}`);
const indent = (text) => text.trim().split('\n').map((l) => `    ${l}`).join('\n');

/** The ref of the first snapshot line with this role and accessible name, e.g. `textbox "Password" [e7]`. */
function refOf(snapshot, role, name) {
  const line = snapshot.split('\n').find((l) => l.includes(`${role} "${name}`) && /\[e\d+\]/.test(l));
  if (!line) throw new Error(`no ${role} "${name}" in the snapshot:\n${snapshot}`);
  return /\[(e\d+)\]/.exec(line)[1];
}
const snap = () => tool('browz_snapshot', { id, mode: 'interactive' });

/** Wait for the next page. While the tab is between two pages its address is empty, which a key
 *  with allowed sites is not let into, so ask again for a moment until the new page is there. */
async function waitForUrl(part) {
  for (let i = 0; ; i++) {
    const r = await call('browz_wait', { id, urlContains: part, timeoutMs: 15_000 });
    if (r.ok) return;
    if (i >= 20 || !/allowed sites/.test(r.text)) throw new Error(`browz_wait: ${r.text}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

let started = false;
try {
  // 1. Open the sign-in page in the profile the key may use.
  await tool('browz_profile_start', { id, headless: process.env.SHOW_WINDOW !== '1' });
  started = true;
  await tool('browz_navigate', { id, url: `${DEMO_URL}/login` });
  const login = await snap();
  const hint = login.split('\n').find((l) => /SAVED SIGN-IN/i.test(l));
  log('snapshot', hint ? hint.trim() : 'sign-in page');

  // 2. Which stored sign-ins may this profile use here? Ids, labels and masked usernames only.
  const listed = await tool('browz_credential_list', { id });
  log('browz_credential_list', 'what the agent receives:');
  console.log(indent(listed));
  const creds = JSON.parse(listed.slice(listed.indexOf('['), listed.lastIndexOf(']') + 1));
  const cred = creds.find((c) => c.sites?.some((s) => s.startsWith(DEMO_URL))) || creds[0];
  if (!cred) throw new Error('no stored sign-in for this site');

  // 3. Browz types the username and the password itself. The agent gets back only "filled".
  const filledUser = await tool('browz_credential_fill', { id, credentialId: cred.id, ref: refOf(login, 'textbox', 'Username'), field: 'username' });
  log('fill username', filledUser.replace(/\s+/g, ' '));
  const filledPass = await tool('browz_credential_fill', { id, credentialId: cred.id, ref: refOf(login, 'textbox', 'Password'), field: 'password' });
  log('fill password', filledPass.replace(/\s+/g, ' '));

  // 4. The password is in the page now. Try to read it back: snapshots hide it, a screenshot is refused.
  const after = await snap();
  log('snapshot (password)', after.split('\n').find((l) => l.includes('"Password"'))?.trim());
  const shot = await call('browz_screenshot', { id });
  log('browz_screenshot', shot.ok ? 'returned an image' : `refused: ${shot.text.split('\n')[0]}`);

  // 5. Submit. The next page is a new document, so the read-back guard lifts with it.
  await tool('browz_act', { id, action: 'click', ref: refOf(after, 'button', 'Sign in') });
  await waitForUrl(cred.hasTotp ? '/verify' : '/account');

  // 6. The one-time code: Browz computes it from the stored seed and types it.
  if (cred.hasTotp) {
    const verify = await snap();
    const filledCode = await tool('browz_credential_fill', {
      id, credentialId: cred.id, ref: refOf(verify, 'textbox', 'Code from your authenticator app'), field: 'totp', submit: true,
    });
    log('fill totp', filledCode.replace(/\s+/g, ' '));
    await waitForUrl('/account');
  }

  // 7. Signed in?
  const account = await tool('browz_snapshot', { id });
  const heading = /Signed in as [\w-]+/.exec(account)?.[0];
  log('result', heading || 'not signed in');
  process.exitCode = heading ? 0 : 1;
} catch (e) {
  log('stopped', String(e.message || e));
  process.exitCode = 1;
} finally {
  if (started) await call('browz_profile_stop', { id }).catch(() => {});
  await client.close();
}
