#!/bin/sh
# Run the sample prompt with Claude Code, non-interactively, allowed to use only the Browz tools.
# Run from this folder (Claude Code reads .mcp.json and CLAUDE.md from here). The Browz app must be open.
set -eu
cd "$(dirname "$0")"
claude -p "$(cat prompt.txt)" \
  --mcp-config .mcp.json --strict-mcp-config \
  --allowedTools "mcp__browz" \
  --output-format text
