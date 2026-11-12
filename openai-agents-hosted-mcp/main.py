"""An OpenAI Agents SDK agent that drives Browz through the hosted MCP server, with an agent token.

    uv run main.py                     # the agent (needs OPENAI_API_KEY and BROWZ_AGENT_TOKEN)
    uv run main.py --no-llm            # the same browser steps as direct tool calls, no model
    uv run main.py --task "Open https://example.com and tell me the title, then end the session"

The hosted server (https://mcp.gobrowz.com/mcp, free public beta) relays each tool call to the
Browz app on YOUR computer, which must be open, signed in, with Remote control on. The browser is
your real Browz profile there; nothing runs in a cloud browser.

Environment:
    BROWZ_AGENT_TOKEN   a Browz agent token (app: Automate > Connect an AI agent, or the account
                        page). Read from the environment, never written in code.
    BROWZ_MCP_URL       default https://mcp.gobrowz.com/mcp. Any Browz Streamable HTTP endpoint works,
                        e.g. a `browz-mcp serve` on your own server with its bearer token.
    BROWZ_DEVICE_ID     which computer to use, when more than one is online (browz_devices_list).
    OPENAI_API_KEY      for the model (not needed with --no-llm).
    OPENAI_MODEL        default gpt-5.4-mini.
"""

import argparse
import asyncio
import json
import os
import sys

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

MCP_URL = os.environ.get("BROWZ_MCP_URL", "https://mcp.gobrowz.com/mcp")
TASK = (
    "Using Browz: create a new profile called agent-check, start it, open https://example.com, "
    "tell me the page title, take a screenshot, then end the session and delete the profile."
)
INSTRUCTIONS = (
    "You control web browsers through the Browz tools (browz_*). Read pages with browz_snapshot and "
    "act on them with browz_act using the refs it returns. If a snapshot says NEEDS A PERSON (a "
    "sign-in, a verification code or a CAPTCHA), call browz_request_human and never type a password "
    "or try to solve a CAPTCHA yourself. Always end the sessions you start with browz_session_end."
)


def with_device(args):
    """Add deviceId when one is set: needed only when several computers are online."""
    device = os.environ.get("BROWZ_DEVICE_ID")
    return {**args, "deviceId": device} if device else args


def text_of(result):
    return "\n".join(getattr(c, "text", "") for c in result.content if getattr(c, "type", "") == "text")


def first_json(text):
    start = text.find("{")
    return json.JSONDecoder().raw_decode(text[start:])[0]


async def direct(server):
    """The task's steps as plain tool calls through the same MCP connection."""
    async def call(name, args):
        result = await server.call_tool(name, with_device(args))
        if getattr(result, "is_error", None) or getattr(result, "isError", None):   # name differs by mcp version
            raise RuntimeError(f"{name}: {text_of(result)}")
        return result

    pid = first_json(text_of(await call("browz_profile_create", {"name": "agent-check"})))["id"]
    try:
        await call("browz_profile_start", {"id": pid})
        await call("browz_navigate", {"id": pid, "url": "https://example.com"})
        snapshot = text_of(await call("browz_snapshot", {"id": pid}))
        title = next((line[len("Title: "):] for line in snapshot.splitlines() if line.startswith("Title: ")), None)
        shot = await call("browz_screenshot", {"id": pid})
        images = [c for c in shot.content if getattr(c, "type", "") == "image"]
        return {"profileId": pid, "title": title, "screenshotBytes": len(images[0].data) * 3 // 4 if images else 0}
    finally:
        await call("browz_session_end", {"id": pid, "delete": True})


async def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-llm", action="store_true", help="direct tool calls, no model")
    parser.add_argument("--task", default=TASK)
    args = parser.parse_args()

    token = os.environ.get("BROWZ_AGENT_TOKEN")
    if not token:
        sys.exit("set BROWZ_AGENT_TOKEN to a Browz agent token (never paste it into code)")

    server = MCPServerStreamableHttp(
        name="browz",
        params={"url": MCP_URL, "headers": {"Authorization": f"Bearer {token}"}, "timeout": 60},
        cache_tools_list=True,
        client_session_timeout_seconds=90,   # a browser start can take longer than the SDK's default 5 s
    )
    async with server:
        tools = [t.name for t in await server.list_tools()]
        if args.no_llm:
            out = await direct(server)
        else:
            agent = Agent(
                name="Browz agent",
                instructions=INSTRUCTIONS,
                mcp_servers=[server],
                model=os.environ.get("OPENAI_MODEL", "gpt-5.4-mini"),
            )
            result = await Runner.run(agent, args.task, max_turns=30)
            out = {"answer": str(result.final_output)}
    print(json.dumps({"ok": True, "mcp": MCP_URL, "tools": len(tools), **out}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
