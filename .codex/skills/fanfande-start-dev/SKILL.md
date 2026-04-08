---
name: fanfande-start-dev
description: Start the Fanfande Studio local development environment by launching the agent server and desktop client in separate PowerShell windows. Use when Codex needs to boot this repository for manual testing or local verification, or when the user asks to start the server or client, run `bun run dev:server` in `packages/fanfandeagent`, or run `bun run dev` in `packages/desktop`.
---

# Fanfande Start Dev

Use the bundled script to start the two long-running development processes required by this repository.

## Workflow

1. Run `scripts/start-dev.ps1`.
2. Let the script open two new PowerShell windows.
3. Keep both windows open for the rest of the verification or testing session.

The script starts exactly these commands:

- Server: `cd <repo>/packages/fanfandeagent && bun run dev:server`
- Client: `cd <repo>/packages/desktop && bun run dev`

## Notes

- Do not replace the commands with alternatives unless the user explicitly changes the workflow.
- Start the two processes in separate windows; do not run one after the other in the same blocking shell.
- If either window exits immediately, inspect the visible error in that window and report it before retrying.
- The script resolves the repository root relative to the skill location, so keep this skill inside the project root at `.codex/skills/fanfande-start-dev`.

## Resource

- `scripts/start-dev.ps1`: Open the server and client in separate PowerShell windows.
