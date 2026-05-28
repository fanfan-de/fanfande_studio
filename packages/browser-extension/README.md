# Anybox Browser Extension

Chrome extension bridge for Anybox browser automation.

## Development

Build the extension:

```bash
corepack pnpm --filter anybox-browser-extension build
```

Load the unpacked extension from:

```text
packages/browser-extension/dist
```

Start Anybox Agent before loading or reconnecting the extension:

```bash
corepack pnpm --dir packages/anyboxagent run dev:server
```

The extension connects to:

```text
ws://127.0.0.1:4096/api/browser-extension/ws
```

Check bridge status:

```bash
curl http://127.0.0.1:4096/api/browser-extension/status
```

## MVP Commands

- `tabs.list`
- `tabs.open`
- `tabs.activate`
- `page.snapshot`
- `page.screenshot`
- `page.click`
- `page.type`
- `page.scroll`

