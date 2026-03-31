# fanfandedesktop

Electron frontend workspace for Fanfande.

## Quick Start

```bash
bun install
bun run dev
```

## Adapter Switch

Copy `.env.example` to `.env` and choose adapter mode:

- `VITE_ADAPTER=mock` for offline UI development
- `VITE_ADAPTER=http` for backend integration

## Scripts

```bash
bun run dev
bun run build
bun run test
bun run test:integration
bun run test:e2e
```
