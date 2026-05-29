import { Buffer } from "node:buffer"
import z from "zod"
import {
  BrowserExtensionAccessibilityTreeResult,
  BrowserExtensionDomTreeResult,
  BrowserExtensionElementActionResult,
  BrowserExtensionFillResult,
  BrowserExtensionInteractiveSnapshotResult,
  BrowserExtensionScreenshotResult,
  BrowserExtensionSnapshotResult,
  BrowserExtensionTabSummary,
  BrowserExtensionTabsListResult,
  BrowserExtensionWaitForResult,
  type BrowserExtensionCommandContext,
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

const InteractiveSnapshotParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  maxElements: z.number().int().positive().max(500).optional().describe("Maximum interactive elements to return."),
})

const DomTreeParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  maxDepth: z.number().int().min(0).max(20).optional().describe("Maximum DOM depth to request. Defaults to 6."),
  maxNodes: z.number().int().positive().max(5_000).optional().describe("Maximum DOM nodes to return. Defaults to 1000."),
  pierce: z.boolean().optional().describe("Whether to include shadow DOM and iframe content documents when Chrome exposes them. Defaults to true."),
  includeText: z.boolean().optional().describe("Whether to include text nodes. Defaults to true."),
  includeAttributes: z.boolean().optional().describe("Whether to include element attributes with sensitive values redacted. Defaults to true."),
})

const AccessibilityTreeParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  maxDepth: z.number().int().min(0).max(30).optional().describe("Maximum accessibility tree depth to request. Defaults to 8."),
  maxNodes: z.number().int().positive().max(5_000).optional().describe("Maximum accessibility nodes to return. Defaults to 1000."),
  includeIgnored: z.boolean().optional().describe("Whether to include Chrome accessibility nodes marked ignored. Defaults to false."),
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

const ClickElementParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  elementId: z.string().min(1).describe("Element id returned by browser_interactive_snapshot."),
  elementName: z.string().optional().describe("Optional human-readable element name from browser_interactive_snapshot."),
  role: z.string().optional().describe("Optional element role from browser_interactive_snapshot."),
  button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button. Defaults to left."),
})

const FillParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  elementId: z.string().min(1).describe("Element id returned by browser_interactive_snapshot."),
  text: z.string().describe("Text to place into the field. Empty string clears the field."),
  elementName: z.string().optional().describe("Optional human-readable element name from browser_interactive_snapshot."),
  sensitive: z.boolean().optional().describe("Whether the target field is sensitive, from browser_interactive_snapshot."),
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

const WaitForParameters = z.object({
  tabId: OptionalTabID.describe("Chrome tab id. Defaults to the current session's owned tab, then active tab."),
  text: z.string().min(1).optional().describe("Visible text to wait for."),
  urlIncludes: z.string().min(1).optional().describe("URL substring to wait for."),
  selector: z.string().min(1).optional().describe("CSS selector to wait for."),
  elementId: z.string().min(1).optional().describe("Element id returned by browser_interactive_snapshot to wait for."),
  timeoutMs: z.number().int().positive().max(60_000).optional().describe("Maximum wait time in milliseconds."),
}).refine((value) => Boolean(value.text || value.urlIncludes || value.selector || value.elementId), {
  message: "Provide text, urlIncludes, selector, or elementId.",
})

const ReleaseTabParameters = z.object({
  tabId: z.number().int().positive().describe("Owned Chrome tab id to release from this Anybox session."),
})

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function commandContext(ctx: Tool.Context): BrowserExtensionCommandContext {
  return {
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    toolCallID: ctx.toolCallID,
  }
}

function withPreferredTab<T extends { tabId?: number }>(parameters: T, ctx: Tool.Context): T {
  const tabId = browserExtensionBridge.preferredTabID(ctx.sessionID, parameters.tabId)
  return tabId ? { ...parameters, tabId } : parameters
}

async function runBrowserCommand(
  method: Parameters<typeof browserExtensionBridge.sendCommand>[0],
  params: unknown,
  ctx: Tool.Context,
  options: { timeoutMs?: number } = {},
) {
  return await browserExtensionBridge.sendCommand(method, params, {
    ...options,
    context: commandContext(ctx),
  })
}

function interactionPermission(
  summary: string,
  options: { action?: "allow" | "ask"; risk?: Tool.ToolPermissionIntent["risk"]; forceAsk?: boolean } = {},
): Tool.ToolPermissionIntent {
  return {
    action: options.action ?? "allow",
    risk: options.risk ?? "low",
    reason: summary,
    forceAsk: options.forceAsk,
  }
}

const DANGEROUS_ACTION_PATTERN =
  /\b(delete|remove|submit|send|publish|post|pay|purchase|buy|checkout|transfer|withdraw|confirm|approve|sign in|login)\b/i

function interactionRisk(label: string | undefined, fallback: Tool.ToolPermissionIntent["risk"] = "medium") {
  if (!label) return fallback
  return DANGEROUS_ACTION_PATTERN.test(label) ? "high" : fallback
}

function approvalTarget(parameters: { tabId?: number; elementId?: string; elementName?: string; role?: string }) {
  const parts = [
    parameters.elementName ? `"${parameters.elementName}"` : undefined,
    parameters.role ? `role=${parameters.role}` : undefined,
    parameters.elementId ? `elementId=${parameters.elementId}` : undefined,
    parameters.tabId ? `tab=${parameters.tabId}` : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "the active Chrome page"
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
    execute: async (_parameters, ctx) => {
      const result = BrowserExtensionTabsListResult.parse(await runBrowserCommand("tabs.list", {}, ctx))
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
    execute: async (parameters, ctx) => {
      const result = BrowserExtensionTabSummary.parse(await runBrowserCommand("tabs.open", parameters, ctx))
      browserExtensionBridge.markOwnedTab(result, commandContext(ctx))
      return {
        title: "Opened Chrome tab",
        text: jsonText(result),
        metadata: { url: parameters.url, tabId: result.id, owned: true },
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
    execute: async (parameters, ctx) => {
      const result = await runBrowserCommand("tabs.activate", parameters, ctx)
      browserExtensionBridge.touchTab(parameters.tabId, commandContext(ctx))
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
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionSnapshotResult.parse(await runBrowserCommand("page.snapshot", commandParameters, ctx))
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
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

export const BrowserInteractiveSnapshotTool = Tool.define(
  "browser_interactive_snapshot",
  async (): Promise<Tool.ToolRuntime<typeof InteractiveSnapshotParameters, Record<string, unknown>>> => ({
    title: "Browser Interactive Snapshot",
    description: "List visible clickable and fillable elements on a Chrome page with stable element ids.",
    parameters: InteractiveSnapshotParameters,
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionInteractiveSnapshotResult.parse(
        await runBrowserCommand("page.interactiveSnapshot", commandParameters, ctx),
      )
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: result.title || result.url || `Chrome tab ${result.tabId}`,
        text: jsonText(result),
        metadata: {
          tabId: result.tabId,
          url: result.url,
          title: result.title,
          count: result.elements.length,
          truncated: result.truncated,
        },
        data: result,
      }
    },
  }),
  {
    title: "Browser Interactive Snapshot",
    aliases: ["browser-elements"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserDomTreeTool = Tool.define(
  "browser_dom_tree",
  async (): Promise<Tool.ToolRuntime<typeof DomTreeParameters, Record<string, unknown>>> => ({
    title: "Browser DOM Tree",
    description: "Read a compact DOM tree for a Chrome page, including node types, names, attributes, text nodes, shadow roots, and content documents when available.",
    parameters: DomTreeParameters,
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionDomTreeResult.parse(
        await runBrowserCommand("page.domTree", commandParameters, ctx),
      )
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: result.title || result.url || `Chrome tab ${result.tabId} DOM tree`,
        text: jsonText(result),
        metadata: {
          tabId: result.tabId,
          url: result.url,
          title: result.title,
          nodeCount: result.nodeCount,
          truncated: result.truncated,
        },
        data: result,
      }
    },
  }),
  {
    title: "Browser DOM Tree",
    aliases: ["browser-dom-tree"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserAccessibilityTreeTool = Tool.define(
  "browser_accessibility_tree",
  async (): Promise<Tool.ToolRuntime<typeof AccessibilityTreeParameters, Record<string, unknown>>> => ({
    title: "Browser Accessibility Tree",
    description: "Read Chrome's accessibility tree for a page, including roles, names, values, properties, parent ids, and child ids.",
    parameters: AccessibilityTreeParameters,
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionAccessibilityTreeResult.parse(
        await runBrowserCommand("page.accessibilityTree", commandParameters, ctx),
      )
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: result.title || result.url || `Chrome tab ${result.tabId} accessibility tree`,
        text: jsonText(result),
        metadata: {
          tabId: result.tabId,
          url: result.url,
          title: result.title,
          nodeCount: result.nodeCount,
          rootNodeId: result.rootNodeId,
          includeIgnored: result.includeIgnored,
          truncated: result.truncated,
        },
        data: result,
      }
    },
  }),
  {
    title: "Browser Accessibility Tree",
    aliases: ["browser-ax-tree", "browser-accessibility-tree"],
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
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionScreenshotResult.parse(await runBrowserCommand("page.screenshot", commandParameters, ctx))
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
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
    assessPermission: (parameters) =>
      interactionPermission(`Click Chrome at (${parameters.x}, ${parameters.y}).`, {
        action: "ask",
        risk: "medium",
        forceAsk: true,
      }),
    describeApproval: (parameters) => ({
      title: "Click Chrome page",
      summary: `Click Chrome at (${parameters.x}, ${parameters.y}).`,
    }),
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = await runBrowserCommand("page.click", commandParameters, ctx)
      browserExtensionBridge.touchTab(commandParameters.tabId, commandContext(ctx))
      return {
        title: "Clicked Chrome page",
        text: jsonText(result),
        metadata: { tabId: commandParameters.tabId, x: parameters.x, y: parameters.y },
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

export const BrowserClickElementTool = Tool.define(
  "browser_click_element",
  async (): Promise<Tool.ToolRuntime<typeof ClickElementParameters, Record<string, unknown>>> => ({
    title: "Browser Click Element",
    description: "Click an element returned by browser_interactive_snapshot.",
    parameters: ClickElementParameters,
    assessPermission: (parameters) => {
      const risk = interactionRisk(parameters.elementName)
      return interactionPermission(`Click ${approvalTarget(parameters)} in Chrome.`, {
        action: "ask",
        risk,
        forceAsk: true,
      })
    },
    describeApproval: (parameters) => ({
      title: "Click Chrome element",
      summary: `Click ${approvalTarget(parameters)} in Chrome.`,
      details: {
        body: `Element: ${approvalTarget(parameters)}`,
      },
    }),
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionElementActionResult.parse(
        await runBrowserCommand("page.clickElement", commandParameters, ctx),
      )
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: "Clicked Chrome element",
        text: jsonText(result),
        metadata: { tabId: result.tabId, elementId: result.elementId, url: result.url },
        data: result,
      }
    },
  }),
  {
    title: "Browser Click Element",
    aliases: ["browser-click-element"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserFillTool = Tool.define(
  "browser_fill",
  async (): Promise<Tool.ToolRuntime<typeof FillParameters, Record<string, unknown>>> => ({
    title: "Browser Fill",
    description: "Fill an input-like element returned by browser_interactive_snapshot.",
    parameters: FillParameters,
    assessPermission: (parameters) => {
      const risk = parameters.sensitive ? "high" : interactionRisk(parameters.elementName)
      return interactionPermission(`Fill ${approvalTarget(parameters)} in Chrome with ${parameters.text.length} characters.`, {
        action: "ask",
        risk,
        forceAsk: true,
      })
    },
    describeApproval: (parameters) => ({
      title: "Fill Chrome field",
      summary: `Fill ${approvalTarget(parameters)} in Chrome with ${parameters.text.length} characters.`,
      details: {
        body: parameters.sensitive
          ? "The target field is marked sensitive; the typed value is intentionally hidden."
          : `Text length: ${parameters.text.length}`,
      },
    }),
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = BrowserExtensionFillResult.parse(await runBrowserCommand("page.fill", commandParameters, ctx))
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: "Filled Chrome field",
        text: jsonText(result),
        metadata: { tabId: result.tabId, elementId: result.elementId, textLength: result.textLength, url: result.url },
        data: result,
      }
    },
  }),
  {
    title: "Browser Fill",
    aliases: ["browser-fill"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserTypeTool = Tool.define(
  "browser_type",
  async (): Promise<Tool.ToolRuntime<typeof TypeParameters, Record<string, unknown>>> => ({
    title: "Browser Type",
    description: "Insert text into the focused element in a Chrome tab.",
    parameters: TypeParameters,
    assessPermission: (parameters) =>
      interactionPermission(`Type ${parameters.text.length} characters into the focused Chrome page element.`, {
        action: "ask",
        risk: "medium",
        forceAsk: true,
      }),
    describeApproval: () => ({
      title: "Type in Chrome page",
      summary: "Type text into the focused Chrome page element.",
    }),
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = await runBrowserCommand("page.type", commandParameters, ctx)
      browserExtensionBridge.touchTab(commandParameters.tabId, commandContext(ctx))
      return {
        title: "Typed in Chrome page",
        text: jsonText(result),
        metadata: { tabId: commandParameters.tabId, textLength: parameters.text.length },
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
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const result = await runBrowserCommand("page.scroll", commandParameters, ctx)
      browserExtensionBridge.touchTab(commandParameters.tabId, commandContext(ctx))
      return {
        title: "Scrolled Chrome page",
        text: jsonText(result),
        metadata: {
          tabId: commandParameters.tabId,
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

export const BrowserWaitForTool = Tool.define(
  "browser_wait_for",
  async (): Promise<Tool.ToolRuntime<typeof WaitForParameters, Record<string, unknown>>> => ({
    title: "Browser Wait For",
    description: "Wait until a Chrome page reaches a URL, text, selector, or element condition.",
    parameters: WaitForParameters,
    execute: async (parameters, ctx) => {
      const commandParameters = withPreferredTab(parameters, ctx)
      const timeoutMs = (parameters.timeoutMs ?? 10_000) + 5_000
      const result = BrowserExtensionWaitForResult.parse(
        await runBrowserCommand("page.waitFor", commandParameters, ctx, { timeoutMs }),
      )
      browserExtensionBridge.touchTab(result.tabId, commandContext(ctx))
      return {
        title: result.matched ? "Chrome wait condition matched" : "Chrome wait condition timed out",
        text: jsonText(result),
        metadata: { tabId: result.tabId, matched: result.matched, url: result.url },
        data: result,
      }
    },
  }),
  {
    title: "Browser Wait For",
    aliases: ["browser-wait-for"],
    capabilities: { kind: "read", readOnly: true, destructive: false, concurrency: "safe" },
  },
)

export const BrowserReleaseTabTool = Tool.define(
  "browser_release_tab",
  async (): Promise<Tool.ToolRuntime<typeof ReleaseTabParameters, Record<string, unknown>>> => ({
    title: "Browser Release Tab",
    description: "Release an owned Chrome tab from the current Anybox session without closing it.",
    parameters: ReleaseTabParameters,
    assessPermission: (parameters) => interactionPermission(`Release Chrome tab ${parameters.tabId} from this Anybox session.`),
    execute: async (parameters, ctx) => {
      const released = browserExtensionBridge.releaseOwnedTab(parameters.tabId, ctx.sessionID)
      return {
        title: released ? `Released Chrome tab ${parameters.tabId}` : `Chrome tab ${parameters.tabId} was not owned`,
        text: jsonText({ tabId: parameters.tabId, released }),
        metadata: { tabId: parameters.tabId, released },
        data: { tabId: parameters.tabId, released },
      }
    },
  }),
  {
    title: "Browser Release Tab",
    aliases: ["browser-release-tab"],
    capabilities: { kind: "interaction", readOnly: false, destructive: false, concurrency: "exclusive" },
  },
)

export const BrowserTools = [
  BrowserStatusTool,
  BrowserGetTabsTool,
  BrowserOpenTabTool,
  BrowserActivateTabTool,
  BrowserSnapshotTool,
  BrowserInteractiveSnapshotTool,
  BrowserDomTreeTool,
  BrowserAccessibilityTreeTool,
  BrowserScreenshotTool,
  BrowserClickTool,
  BrowserClickElementTool,
  BrowserFillTool,
  BrowserTypeTool,
  BrowserScrollTool,
  BrowserWaitForTool,
  BrowserReleaseTabTool,
]
