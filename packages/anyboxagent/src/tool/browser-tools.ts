import { Buffer } from "node:buffer"
import z from "zod"
import {
  BrowserExtensionScreenshotResult,
  BrowserExtensionSnapshotResult,
  BrowserExtensionTabsListResult,
} from "@anybox/shared/browser-extension"
import { browserExtensionBridge } from "#browser-extension/bridge.ts"
import * as ImageAssets from "#session/support/image-assets.ts"
import * as Tool from "#tool/tool.ts"

const OptionalTabID = z.number().int().positive().optional()

const EmptyParameters = z.object({})

const OpenTabParameters = z.object({
  url: z.string().url().describe("The URL to open in Chrome."),
  active: z.boolean().optional().describe("Whether to activate the new tab. Defaults to true."),
})

const ActivateTabParameters = z.object({
  tabId: z.number().int().positive().describe("Chrome tab id to activate."),
})

const SnapshotParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the active tab in the focused window."),
  maxTextChars: z.number().int().positive().max(100_000).optional().describe("Maximum visible text characters to return."),
})

const ScreenshotParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the active tab in the focused window."),
  fullPage: z.boolean().optional().describe("Capture beyond the current viewport when Chrome supports it."),
})

const ClickParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the active tab in the focused window."),
  x: z.number().finite().describe("Viewport x coordinate."),
  y: z.number().finite().describe("Viewport y coordinate."),
  button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button. Defaults to left."),
})

const TypeParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the active tab in the focused window."),
  text: z.string().min(1).describe("Text to insert into the focused element."),
})

const ScrollParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the active tab in the focused window."),
  scrollX: z.number().finite().optional().describe("Horizontal scroll delta in CSS pixels."),
  scrollY: z.number().finite().optional().describe("Vertical scroll delta in CSS pixels."),
})

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function runBrowserCommand(method: Parameters<typeof browserExtensionBridge.sendCommand>[0], params?: unknown) {
  return await browserExtensionBridge.sendCommand(method, params)
}

function interactionPermission(summary: string): Tool.ToolPermissionIntent {
  return {
    action: "allow",
    risk: "low",
    reason: summary,
  }
}

export const BrowserStatusTool = Tool.define(
  "browser_status",
  async (): Promise<Tool.ToolRuntime<typeof EmptyParameters, Record<string, unknown>>> => ({
    title: "Browser Status",
    description: "Check whether the Anybox Chrome extension is connected.",
    parameters: EmptyParameters,
    execute: async () => {
      const status = browserExtensionBridge.status()
      return {
        title: status.connected ? "Chrome extension connected" : "Chrome extension disconnected",
        text: jsonText(status),
        metadata: status,
        data: status,
      }
    },
  }),
  {
    title: "Browser Status",
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserGetTabsTool = Tool.define(
  "browser_get_tabs",
  async (): Promise<Tool.ToolRuntime<typeof EmptyParameters, Record<string, unknown>>> => ({
    title: "Browser Get Tabs",
    description: "List Chrome tabs visible to the Anybox Chrome extension.",
    parameters: EmptyParameters,
    execute: async () => {
      const result = BrowserExtensionTabsListResult.parse(await runBrowserCommand("tabs.list", {}))
      return {
        title: `Chrome tabs (${result.tabs.length})`,
        text: jsonText(result),
        metadata: { count: result.tabs.length },
        data: result,
      }
    },
  }),
  {
    title: "Browser Get Tabs",
    aliases: ["browser-list-tabs"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserOpenTabTool = Tool.define(
  "browser_open_tab",
  async (): Promise<Tool.ToolRuntime<typeof OpenTabParameters, Record<string, unknown>>> => ({
    title: "Browser Open Tab",
    description: "Open a URL in Chrome through the Anybox Chrome extension.",
    parameters: OpenTabParameters,
    assessPermission: (parameters) => interactionPermission(`Open ${parameters.url} in Chrome.`),
    describeApproval: (parameters) => ({
      title: "Open Chrome tab",
      summary: `Open ${parameters.url} in Chrome.`,
    }),
    execute: async (parameters) => {
      const result = await runBrowserCommand("tabs.open", parameters)
      return {
        title: "Opened Chrome tab",
        text: jsonText(result),
        metadata: { url: parameters.url },
        data: result,
      }
    },
  }),
  {
    title: "Browser Open Tab",
    aliases: ["browser-open"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserActivateTabTool = Tool.define(
  "browser_activate_tab",
  async (): Promise<Tool.ToolRuntime<typeof ActivateTabParameters, Record<string, unknown>>> => ({
    title: "Browser Activate Tab",
    description: "Activate an existing Chrome tab.",
    parameters: ActivateTabParameters,
    assessPermission: (parameters) => interactionPermission(`Activate Chrome tab ${parameters.tabId}.`),
    execute: async (parameters) => {
      const result = await runBrowserCommand("tabs.activate", parameters)
      return {
        title: `Activated Chrome tab ${parameters.tabId}`,
        text: jsonText(result),
        metadata: { tabId: parameters.tabId },
        data: result,
      }
    },
  }),
  {
    title: "Browser Activate Tab",
    aliases: ["browser-activate-tab"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserSnapshotTool = Tool.define(
  "browser_snapshot",
  async (): Promise<Tool.ToolRuntime<typeof SnapshotParameters, Record<string, unknown>>> => ({
    title: "Browser Snapshot",
    description: "Read the current Chrome page title, URL, visible text, links, buttons, and inputs.",
    parameters: SnapshotParameters,
    execute: async (parameters) => {
      const result = BrowserExtensionSnapshotResult.parse(await runBrowserCommand("page.snapshot", parameters))
      return {
        title: result.title || result.url || `Chrome tab ${result.tabId}`,
        text: jsonText(result),
        metadata: {
          tabId: result.tabId,
          url: result.url,
          title: result.title,
          truncated: result.truncated,
        },
        data: result,
      }
    },
  }),
  {
    title: "Browser Snapshot",
    aliases: ["browser-page-snapshot"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserScreenshotTool = Tool.define(
  "browser_screenshot",
  async (): Promise<Tool.ToolRuntime<typeof ScreenshotParameters, Record<string, unknown>>> => ({
    title: "Browser Screenshot",
    description: "Capture a PNG screenshot of a Chrome tab.",
    parameters: ScreenshotParameters,
    execute: async (parameters, ctx) => {
      const result = BrowserExtensionScreenshotResult.parse(await runBrowserCommand("page.screenshot", parameters))
      const bytes = new Uint8Array(Buffer.from(result.data, "base64"))
      const asset = await ImageAssets.saveImageAsset({
        sessionID: ctx.sessionID,
        bytes,
        mime: result.mime,
        filename: `chrome-tab-${result.tabId}.png`,
        sourceTool: "view_image",
        prompt: "Chrome tab screenshot captured by browser_screenshot.",
      })
      return {
        title: `Screenshot of Chrome tab ${result.tabId}`,
        text: `Captured screenshot for Chrome tab ${result.tabId}: ${asset.url}`,
        metadata: {
          tabId: result.tabId,
          assetID: asset.assetID,
          url: asset.url,
          width: asset.width,
          height: asset.height,
          sizeBytes: asset.sizeBytes,
        },
        attachments: [{
          url: asset.url,
          mime: asset.mime,
          filename: asset.filename,
          metadata: {
            tabId: result.tabId,
            assetID: asset.assetID,
          },
        }],
        data: {
          tabId: result.tabId,
          asset,
        },
      }
    },
  }),
  {
    title: "Browser Screenshot",
    aliases: ["browser-capture-screenshot"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserClickTool = Tool.define(
  "browser_click",
  async (): Promise<Tool.ToolRuntime<typeof ClickParameters, Record<string, unknown>>> => ({
    title: "Browser Click",
    description: "Click viewport coordinates in a Chrome tab.",
    parameters: ClickParameters,
    assessPermission: (parameters) => interactionPermission(`Click Chrome at (${parameters.x}, ${parameters.y}).`),
    describeApproval: (parameters) => ({
      title: "Click Chrome page",
      summary: `Click Chrome at (${parameters.x}, ${parameters.y}).`,
    }),
    execute: async (parameters) => {
      const result = await runBrowserCommand("page.click", parameters)
      return {
        title: "Clicked Chrome page",
        text: jsonText(result),
        metadata: { tabId: parameters.tabId, x: parameters.x, y: parameters.y },
        data: result,
      }
    },
  }),
  {
    title: "Browser Click",
    aliases: ["browser-click"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserTypeTool = Tool.define(
  "browser_type",
  async (): Promise<Tool.ToolRuntime<typeof TypeParameters, Record<string, unknown>>> => ({
    title: "Browser Type",
    description: "Insert text into the focused element in a Chrome tab.",
    parameters: TypeParameters,
    assessPermission: () => interactionPermission("Type text into the focused Chrome page element."),
    describeApproval: () => ({
      title: "Type in Chrome page",
      summary: "Type text into the focused Chrome page element.",
    }),
    execute: async (parameters) => {
      const result = await runBrowserCommand("page.type", parameters)
      return {
        title: "Typed in Chrome page",
        text: jsonText(result),
        metadata: { tabId: parameters.tabId, textLength: parameters.text.length },
        data: result,
      }
    },
  }),
  {
    title: "Browser Type",
    aliases: ["browser-type"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserScrollTool = Tool.define(
  "browser_scroll",
  async (): Promise<Tool.ToolRuntime<typeof ScrollParameters, Record<string, unknown>>> => ({
    title: "Browser Scroll",
    description: "Scroll a Chrome tab by a viewport delta.",
    parameters: ScrollParameters,
    assessPermission: () => interactionPermission("Scroll the Chrome page."),
    execute: async (parameters) => {
      const result = await runBrowserCommand("page.scroll", parameters)
      return {
        title: "Scrolled Chrome page",
        text: jsonText(result),
        metadata: {
          tabId: parameters.tabId,
          scrollX: parameters.scrollX ?? 0,
          scrollY: parameters.scrollY ?? 0,
        },
        data: result,
      }
    },
  }),
  {
    title: "Browser Scroll",
    aliases: ["browser-scroll"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserTools = [
  BrowserStatusTool,
  BrowserGetTabsTool,
  BrowserOpenTabTool,
  BrowserActivateTabTool,
  BrowserSnapshotTool,
  BrowserScreenshotTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScrollTool,
]
