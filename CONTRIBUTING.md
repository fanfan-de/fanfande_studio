# Contributing

Thanks for taking the time to improve Anybox.

## Development Setup

```bash
corepack enable
pnpm install
```

Run the desktop app:

```bash
pnpm --filter anybox-desktop-agent dev
```

Run the Agent service directly:

```bash
cd packages/anyboxagent
bun run dev:server
```

## Before Opening A Pull Request

- Keep changes scoped to one behavior or maintenance task.
- Update docs when commands, setup, public behavior, or contribution flow changes.
- Do not commit local runtime data, generated exports, debug output, personal notes, or lockfiles from package managers other than pnpm.
- Run the relevant checks before submitting:

```bash
pnpm verify:versions
pnpm --filter anybox-desktop-agent typecheck
pnpm --filter anybox-desktop-agent test
pnpm --filter @anybox/shared typecheck
pnpm --filter @anybox/platform typecheck
```

Use the pull request template to describe the user-facing change, test coverage, and any follow-up work.
