# Anybox

Anybox is an open-source desktop workspace for running AI agents on local projects. It brings project folders, conversations, terminals, model/provider settings, skills, MCP servers, permissions, and tool traces into one inspectable Electron app.

The repository is a `pnpm` workspace. The core product is split between the Electron desktop app in `packages/desktop` and the Bun/Hono agent service in `packages/anyboxagent`.

## What It Does

- Manages local project workspaces and agent conversations.
- Streams reasoning, assistant text, tool calls, patches, errors, and permission state into the desktop UI.
- Runs a local Agent service automatically, or connects to a custom `ANYBOX_AGENT_BASE_URL`.
- Provides an integrated terminal through `node-pty` and `xterm`.
- Supports provider/model configuration, MCP servers, skills, and project-scoped settings.
- Includes Git-related desktop workflows for reviewing, committing, and pushing work.

## Download

Installers are published from GitHub Releases:

- [Latest release](https://github.com/fanfan-de/fanfande_studio/releases/latest)
- Windows x64 and macOS Apple Silicon are the current primary targets.

## Quick Start

### Requirements

- Node.js 20+
- pnpm 10+
- Bun 1.3+

### Install Dependencies

```bash
corepack enable
pnpm install
```

### Start The Desktop App

```bash
pnpm --filter anybox-desktop-agent dev
```

The desktop app starts the local Agent service automatically by default.

### Start The Agent Service Directly

```bash
cd packages/anyboxagent
bun run dev:server
```

The service listens on `http://127.0.0.1:4096` by default.

To connect the desktop app to an already running Agent service:

```powershell
$env:ANYBOX_DISABLE_MANAGED_AGENT="1"
$env:ANYBOX_AGENT_BASE_URL="http://127.0.0.1:4096"
cd packages/desktop
bun run dev
```

## Common Commands

```bash
pnpm build
pnpm dist
pnpm test
pnpm typecheck
pnpm verify:versions
```

Package-specific checks:

```bash
pnpm --filter anybox-desktop-agent typecheck
pnpm --filter anybox-desktop-agent test
pnpm --filter @anybox/shared typecheck
pnpm --filter @anybox/shared test
pnpm --filter @anybox/platform typecheck
pnpm --filter @anybox/platform test
pnpm --filter anybox-site build
```

## Repository Layout

```text
.
├─ .github/                 GitHub Actions and contribution templates
├─ docs/                    Architecture and plugin development notes
├─ packages/
│  ├─ desktop/              Electron desktop application
│  ├─ anyboxagent/          Bun/Hono Agent service and core runtime
│  ├─ shared/               Shared API and IPC contracts
│  ├─ platform/             Platform adapter utilities
│  ├─ monitor/              Monitor web UI
│  ├─ site/                 Public Anybox website and docs
│  └─ anyboxdesktoptest/    Experimental desktop test package
├─ scripts/                 Repository maintenance scripts
├─ package.json             Workspace entrypoint scripts
└─ pnpm-workspace.yaml      Workspace package configuration
```

## Documentation

- [Desktop package notes](./packages/desktop/README.md)
- [Third-party plugin development](./docs/anybox-third-party-plugin-development.md)
- [Connector development guide](./docs/connector-development-guide.md)
- [Plugin module v1](./docs/plugin-module-v1.md)
- [Local connector design](./docs/plugin-local-connectors-design.md)
- [Thread view frontend design](./docs/thread-view-frontend-design.md)
- [Multi-session concurrency comparison](./docs/multi-session-concurrency-comparison.md)
- [Public website docs](./packages/site/src/docs/content/下载安装.md)

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANYBOX_AGENT_BASE_URL` | Agent service URL used by the desktop app | `http://127.0.0.1:4096` |
| `ANYBOX_AGENT_WORKDIR` | Default working directory for new sessions | Current process working directory |
| `ANYBOX_DISABLE_MANAGED_AGENT` | Set to `1` to prevent the desktop app from starting its managed Agent | Unset |
| `ANYBOX_BUN_BINARY` | Bun executable path | Auto-detected |
| `ANYBOX_SERVER_HOST` | Agent service host | `127.0.0.1` |
| `ANYBOX_SERVER_PORT` | Agent service port | `4096` |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow and pull request expectations. Security reports should follow [SECURITY.md](./SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
