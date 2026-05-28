import { z } from "zod"

export const BrowserExtensionCommandMethod = z.enum([
  "tabs.list",
  "tabs.open",
  "tabs.activate",
  "page.snapshot",
  "page.screenshot",
  "page.click",
  "page.type",
  "page.scroll",
  "page.executeScript",
])
export type BrowserExtensionCommandMethod = z.infer<typeof BrowserExtensionCommandMethod>

export const BrowserExtensionHelloMessage = z.object({
  type: z.literal("hello"),
  extensionInstanceID: z.string().min(1),
  extensionID: z.string().min(1).optional(),
  version: z.string().min(1),
})
export type BrowserExtensionHelloMessage = z.infer<typeof BrowserExtensionHelloMessage>

export const BrowserExtensionResultMessage = z.discriminatedUnion("ok", [
  z.object({
    type: z.literal("result"),
    commandID: z.string().min(1),
    ok: z.literal(true),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("result"),
    commandID: z.string().min(1),
    ok: z.literal(false),
    error: z.string(),
  }),
])
export type BrowserExtensionResultMessage = z.infer<typeof BrowserExtensionResultMessage>

export const BrowserExtensionEventMessage = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  data: z.unknown().optional(),
})
export type BrowserExtensionEventMessage = z.infer<typeof BrowserExtensionEventMessage>

export const BrowserExtensionPongMessage = z.object({
  type: z.literal("pong"),
  nonce: z.string().optional(),
})
export type BrowserExtensionPongMessage = z.infer<typeof BrowserExtensionPongMessage>

export const BrowserExtensionClientMessage = z.union([
  BrowserExtensionHelloMessage,
  BrowserExtensionResultMessage,
  BrowserExtensionEventMessage,
  BrowserExtensionPongMessage,
])
export type BrowserExtensionClientMessage = z.infer<typeof BrowserExtensionClientMessage>

export const BrowserExtensionCommandMessage = z.object({
  type: z.literal("command"),
  commandID: z.string().min(1),
  method: BrowserExtensionCommandMethod,
  params: z.unknown().optional(),
})
export type BrowserExtensionCommandMessage = z.infer<typeof BrowserExtensionCommandMessage>

export const BrowserExtensionPingMessage = z.object({
  type: z.literal("ping"),
  nonce: z.string().optional(),
})
export type BrowserExtensionPingMessage = z.infer<typeof BrowserExtensionPingMessage>

export const BrowserExtensionServerMessage = z.union([
  BrowserExtensionCommandMessage,
  BrowserExtensionPingMessage,
])
export type BrowserExtensionServerMessage = z.infer<typeof BrowserExtensionServerMessage>

export const BrowserExtensionTabSummary = z.object({
  id: z.number().int(),
  windowId: z.number().int().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  active: z.boolean().optional(),
})
export type BrowserExtensionTabSummary = z.infer<typeof BrowserExtensionTabSummary>

export const BrowserExtensionTabsListResult = z.object({
  tabs: z.array(BrowserExtensionTabSummary),
})
export type BrowserExtensionTabsListResult = z.infer<typeof BrowserExtensionTabsListResult>

export const BrowserExtensionSnapshotResult = z.object({
  tabId: z.number().int(),
  url: z.string().optional(),
  title: z.string().optional(),
  text: z.string(),
  links: z.array(z.object({ text: z.string(), href: z.string() })),
  buttons: z.array(z.object({ text: z.string() })),
  inputs: z.array(z.object({
    name: z.string().optional(),
    type: z.string().optional(),
    placeholder: z.string().optional(),
    value: z.string().optional(),
  })),
  truncated: z.boolean(),
})
export type BrowserExtensionSnapshotResult = z.infer<typeof BrowserExtensionSnapshotResult>

export const BrowserExtensionScreenshotResult = z.object({
  tabId: z.number().int(),
  mime: z.literal("image/png"),
  data: z.string().min(1),
})
export type BrowserExtensionScreenshotResult = z.infer<typeof BrowserExtensionScreenshotResult>
