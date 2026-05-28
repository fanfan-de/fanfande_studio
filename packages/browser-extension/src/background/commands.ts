import type { BrowserExtensionCommandMethod } from "@anybox/shared/browser-extension"

const attachedTabs = new Set<number>()

type TabSummary = {
  id: number
  windowId?: number
  title?: string
  url?: string
  active?: boolean
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function readNumber(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function toTabSummary(tab: any): TabSummary {
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    active: tab.active,
  }
}

async function activeTabId(rawTabId: unknown) {
  const tabId = readNumber(rawTabId)
  if (Number.isInteger(tabId) && tabId! > 0) return tabId!

  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const active = activeTabs.find((tab: any) => typeof tab.id === "number")
  if (active?.id) return active.id as number

  const fallbackTabs = await chrome.tabs.query({})
  const fallback = fallbackTabs.find((tab: any) => typeof tab.id === "number")
  if (fallback?.id) return fallback.id as number

  throw new Error("No Chrome tab is available.")
}

async function tabInfo(tabId: number) {
  const tab = await chrome.tabs.get(tabId)
  return toTabSummary(tab)
}

async function attachDebugger(tabId: number) {
  if (attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.attach({ tabId }, "1.3")
    attachedTabs.add(tabId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("Another debugger") || message.includes("already attached")) {
      throw new Error(`Cannot control tab ${tabId}: ${message}`)
    }
    throw error
  }
}

async function sendCdp(tabId: number, method: string, commandParams?: Record<string, unknown>) {
  await attachDebugger(tabId)
  return await chrome.debugger.sendCommand({ tabId }, method, commandParams)
}

async function runInPage<T>(tabId: number, func: (...args: any[]) => T, args: unknown[] = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  })
  return result?.result as T
}

async function listTabs() {
  const tabs = await chrome.tabs.query({})
  return {
    tabs: tabs
      .filter((tab: any) => typeof tab.id === "number")
      .map(toTabSummary),
  }
}

async function openTab(params: unknown) {
  const input = readRecord(params)
  const url = readString(input.url)
  if (!url) throw new Error("tabs.open requires a URL.")
  const tab = await chrome.tabs.create({ url, active: input.active !== false })
  return toTabSummary(tab)
}

async function activateTab(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const tab = await chrome.tabs.update(tabId, { active: true })
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
  }
  return toTabSummary(tab)
}

async function snapshot(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const maxTextChars = Math.min(readNumber(input.maxTextChars, 20_000) ?? 20_000, 100_000)
  const tab = await tabInfo(tabId)
  const data = await runInPage(tabId, (limit: number) => {
    const trim = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim()
    const text = trim(document.body?.innerText ?? "")
    const limitedText = text.length > limit ? `${text.slice(0, limit).trimEnd()}\n\n[truncated]` : text
    const links = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 80)
      .map((link) => ({
        text: trim(link.textContent),
        href: (link as HTMLAnchorElement).href,
      }))
      .filter((link) => link.href)
    const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']"))
      .slice(0, 80)
      .map((button) => ({ text: trim((button as HTMLInputElement).value || button.textContent) }))
      .filter((button) => button.text)
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
      .slice(0, 80)
      .map((field) => {
        const input = field as HTMLInputElement
        return {
          name: input.name || undefined,
          type: input.type || field.tagName.toLowerCase(),
          placeholder: input.placeholder || undefined,
          value: typeof input.value === "string" ? input.value.slice(0, 200) : undefined,
        }
      })
    return {
      text: limitedText,
      links,
      buttons,
      inputs,
      truncated: text.length > limit,
    }
  }, [maxTextChars])

  return {
    tabId,
    url: tab.url,
    title: tab.title,
    ...data,
  }
}

async function screenshot(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const fullPage = readBoolean(input.fullPage)
  const result = await sendCdp(tabId, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: fullPage,
  }) as { data?: string }
  if (!result.data) throw new Error("Chrome did not return screenshot data.")
  return {
    tabId,
    mime: "image/png",
    data: result.data,
  }
}

async function click(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const x = readNumber(input.x)
  const y = readNumber(input.y)
  if (x === undefined || y === undefined) throw new Error("page.click requires finite x and y.")
  const button = readString(input.button, "left")
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    clickCount: 1,
  })
  await sendCdp(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    clickCount: 1,
  })
  await chrome.tabs.sendMessage(tabId, { type: "ANYBOX_BROWSER_BRIDGE_ACTIVE" }).catch(() => undefined)
  return { tabId, x, y, button }
}

async function typeText(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const text = readString(input.text)
  if (!text) throw new Error("page.type requires text.")
  await sendCdp(tabId, "Input.insertText", { text })
  await chrome.tabs.sendMessage(tabId, { type: "ANYBOX_BROWSER_BRIDGE_ACTIVE" }).catch(() => undefined)
  return { tabId, textLength: text.length }
}

async function scroll(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const scrollX = readNumber(input.scrollX, 0) ?? 0
  const scrollY = readNumber(input.scrollY, 0) ?? 0
  const position = await runInPage(tabId, (x: number, y: number) => {
    window.scrollBy(x, y)
    return { scrollX: window.scrollX, scrollY: window.scrollY }
  }, [scrollX, scrollY])
  await chrome.tabs.sendMessage(tabId, { type: "ANYBOX_BROWSER_BRIDGE_ACTIVE" }).catch(() => undefined)
  return { tabId, scrollX, scrollY, position }
}

async function executeScript(params: unknown) {
  const input = readRecord(params)
  const tabId = await activeTabId(input.tabId)
  const script = readString(input.script)
  if (!script) throw new Error("page.executeScript requires script.")
  const result = await sendCdp(tabId, "Runtime.evaluate", {
    expression: script,
    awaitPromise: true,
    returnByValue: true,
  }) as { result?: { value?: unknown } }
  return {
    tabId,
    value: result.result?.value,
  }
}

export async function handleBrowserCommand(method: BrowserExtensionCommandMethod, params?: unknown) {
  switch (method) {
    case "tabs.list":
      return await listTabs()
    case "tabs.open":
      return await openTab(params)
    case "tabs.activate":
      return await activateTab(params)
    case "page.snapshot":
      return await snapshot(params)
    case "page.screenshot":
      return await screenshot(params)
    case "page.click":
      return await click(params)
    case "page.type":
      return await typeText(params)
    case "page.scroll":
      return await scroll(params)
    case "page.executeScript":
      return await executeScript(params)
  }
}

chrome.debugger.onDetach.addListener((source: any) => {
  if (typeof source.tabId === "number") attachedTabs.delete(source.tabId)
})
