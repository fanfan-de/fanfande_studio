---
name: Browser
description: Use when the Browser plugin is enabled and the user asks to inspect or control Chrome through the Anybox browser connector.
---

# Browser

Use the Browser MCP tools from this plugin to inspect and control Chrome through the Anybox browser extension.

Start with `browser_status` when connection state is unclear. Prefer `browser_open_tab` for new work and carry the returned `tabId` into later calls. Use `browser_interactive_snapshot` before element-level actions, then pass the returned `elementId` to `browser_click_element` or `browser_fill`. Use `browser_wait_for` after navigation or actions that change the page.
