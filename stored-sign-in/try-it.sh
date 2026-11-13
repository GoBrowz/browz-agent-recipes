#!/bin/sh
# The whole recipe in one go: start the demo site, store its sign-in in Browz, give an agent a key
# that may use it, let the agent sign in, show what the log recorded, then revoke the key.
# Run from anywhere, with the Browz app open (or a Browz agent running) and `npm install` done.
#
#   BROWZ       the Browz CLI (default: browz)
#   BROWZ_MCP   the browz-mcp binary for agent.mjs (default: npx -y @browz/mcp)
#   AGENT=claude  let Claude Code (claude-code/) be the agent instead of agent.mjs
#   MCP_CONFIG  with AGENT=claude: another MCP config than claude-code/.mcp.json
#   KEEP=1      keep the demo profile and the stored sign-in afterwards
set -eu
cd "$(dirname "$0")"
BROWZ=${BROWZ:-browz}
work=$(mktemp -d)
site_pid=''
profile=''
cred=''
cleanup() {
  [ -n "$site_pid" ] && kill "$site_pid" 2>/dev/null || true   # the site deletes its secrets file
  if [ "${KEEP:-}" != 1 ]; then
    [ -n "$cred" ] && $BROWZ credential remove "$cred" >/dev/null 2>&1 || true
    [ -n "$profile" ] && $BROWZ delete "$profile" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

echo '== 1. the demo site (on your computer only)'
node demo-site.mjs > "$work/site.log" &
site_pid=$!
until grep -q '^secrets file' "$work/site.log" 2>/dev/null; do sleep 0.2; done
url=$(awk '/^demo site/ { sub("/login$", "", $3); print $3 }' "$work/site.log")
secrets=$(awk '/^secrets file/ { print $3 }' "$work/site.log")
echo "site          $url"

echo '== 2. a profile for the agent'
profile=$($BROWZ --json create "signin-demo" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].id))')
echo "profile       $profile"

echo '== 3. store the sign-in in Browz: password and TOTP seed from stdin, never the command line'
$BROWZ credential add --label "Demo site" --site "$url" --username demo-user \
  --profile "$profile" --totp --password-stdin < "$secrets" | tee "$work/cred.txt"
cred=$(awk '{ print $1; exit }' "$work/cred.txt")

echo '== 4. a local agent key: this profile only, this site only, may use stored sign-ins'
( umask 077
  $BROWZ agent-token create --name signin-demo --profiles "$profile" --sites "${url#http://}" \
    --scopes browz:profiles:read,browz:profiles:write,browz:browser,browz:credentials:use --days 1 \
    > "$work/agent-key" 2> "$work/key.txt" )
key_id=$(grep -o 'la_[0-9a-f]*' "$work/key.txt" | head -n 1)
echo "agent key     $key_id (the key itself is in a file only you can read)"

echo '== 5. the agent signs in'
if [ "${AGENT:-script}" = claude ]; then
  # Claude Code in claude-code/ (its .mcp.json and CLAUDE.md), allowed only the Browz tools. The
  # whole transcript, tool results included, goes to agent.out for the check in step 7.
  prompt=$(sed -e "s|{PROFILE}|$profile|g" -e "s|{URL}|$url|g" claude-code/prompt.txt)
  ( cd claude-code && BROWZ_AGENT_KEY_FILE="$work/agent-key" claude -p "$prompt" \
      --mcp-config "${MCP_CONFIG:-.mcp.json}" --strict-mcp-config --allowedTools mcp__browz \
      --output-format stream-json --verbose ) > "$work/agent.out"
  node -e 'for (const l of require("fs").readFileSync(process.argv[1], "utf8").split("\n")) {
    if (!l.trim()) continue; const m = JSON.parse(l);
    for (const c of m.message?.content || []) if (c.type === "tool_use") console.log("tool call   ", c.name.replace(/^mcp__browz__/, ""), JSON.stringify(c.input));
    if (m.type === "result") console.log("Claude Code  " + m.result); }' "$work/agent.out"
else
  BROWZ_LOCAL_AGENT_TOKEN_FILE="$work/agent-key" DEMO_URL="$url" PROFILE="$profile" node agent.mjs | tee "$work/agent.out"
fi

echo '== 6. what the log recorded (the field, never the value)'
$BROWZ agent-token log --agent "$key_id" --limit 30 | grep credential_fill || true
$BROWZ --json json GET /api/v1/log/list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s).data.filter(r=>r.action==="credential.fill"&&r.detail.includes(process.argv[1])).reverse())console.log(r.at,r.action,r.detail)})' "$cred"

echo '== 7. did the password or seed reach the agent?'
if grep -qF -f "$secrets" "$work/agent.out"; then echo 'yes: stop and report this'; exit 1; fi
echo 'no: neither appears in anything the agent received'

echo '== 8. revoke the key; the agent is refused from now on'
$BROWZ agent-token revoke "$key_id" > /dev/null
echo "revoked       $key_id"
BROWZ_LOCAL_AGENT_TOKEN_FILE="$work/agent-key" DEMO_URL="$url" PROFILE="$profile" node agent.mjs 2>&1 | head -n 3 || true
