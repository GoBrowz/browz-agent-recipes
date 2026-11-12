"""Drive a Browz profile from Python through the Local API, with the standard library only.

    python3 browz_rest.py                       # a throwaway profile, removed afterwards
    python3 browz_rest.py --url https://example.com/ --keep

Create a profile, start it, open a page, read it as an accessibility snapshot, take a screenshot,
stop it, then delete and purge the profile. No browser driver, no pip install: every step is one
HTTP call to the Browz agent on this computer (OpenAPI: https://gobrowz.com/openapi/local-api.json).

Credentials: BROWZ_TOKEN and BROWZ_API (host:port) when set, otherwise the token in
<BROWZ_DATA or ~/.browz>/api-token and the port in agent.json (default 50333).
"""

import argparse
import base64
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

DATA = pathlib.Path(os.environ.get("BROWZ_DATA") or pathlib.Path.home() / ".browz")


def credentials():
    token = os.environ.get("BROWZ_TOKEN") or (DATA / "api-token").read_text().strip()
    host = os.environ.get("BROWZ_API")
    if not host:
        port = 50333
        try:
            port = json.loads((DATA / "agent.json").read_text()).get("port") or port
        except (OSError, ValueError):
            pass
        host = f"127.0.0.1:{port}"
    return host, token


HOST, TOKEN = credentials()


def api(path, body=None, timeout=120):
    """One Local API call: GET without a body, POST with one. Raises with the agent's message."""
    req = urllib.request.Request(
        f"http://{HOST}{path}",
        data=None if body is None else json.dumps(body).encode(),
        method="GET" if body is None else "POST",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            reply = json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        reply = json.loads(e.read() or b"{}")
        raise RuntimeError(f"{path}: HTTP {e.code}: {reply.get('msg') or reply.get('error')}") from None
    if reply.get("code", 0) != 0:
        raise RuntimeError(f"{path}: {reply.get('msg') or reply}")
    return reply


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--url", default="https://example.com/")
    p.add_argument("--keep", action="store_true", help="keep the profile afterwards")
    p.add_argument("--out", default="screenshot.png")
    args = p.parse_args()

    profile = api("/api/v1/profile/create", {"name": f"recipe-python-{int(time.time())}"})["data"]
    pid = profile["id"]
    started = False
    try:
        start = api("/api/v1/browser/start", {"id": pid})["data"]
        started = True
        nav = api("/api/v1/browser/navigate", {"id": pid, "url": args.url})["data"]
        snap = api("/api/v1/browser/snapshot", {"id": pid, "mode": "compact", "maxTokens": 2000})["data"]
        shot = api("/api/v1/browser/screenshot", {"id": pid})["data"]
        pathlib.Path(args.out).write_bytes(base64.b64decode(shot["base64"]))
        print(json.dumps({
            "ok": True,
            "profileId": pid,
            "debugPort": start["debugPort"],
            "url": nav.get("url"),
            "title": snap["title"],
            "snapshotRefs": snap["refs"],
            "snapshotFirstLines": snap["snapshot"].splitlines()[:5],
            "screenshot": args.out,
        }, indent=2, ensure_ascii=False))
    finally:
        if started:
            api("/api/v1/browser/stop", {"id": pid})
        if not args.keep:
            api("/api/v1/profile/delete", {"id": pid})
            api("/api/v1/profile/purge", {"id": pid})


if __name__ == "__main__":
    main()
