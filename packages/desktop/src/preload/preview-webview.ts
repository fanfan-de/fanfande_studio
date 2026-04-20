import { ipcRenderer } from "electron"

type PreviewMode = "browse" | "comment"

const HIGHLIGHT_ID = "__desktop-preview-highlight__"
const FIT_STYLE_ID = "__desktop-preview-fit__"
const MIN_SCALE = 0.04
const SCALE_EPSILON = 0.001

let currentMode: PreviewMode = "browse"
let currentScale = 1
let fitFrame = 0
let isApplyingFit = false
let fitResizeObserver: ResizeObserver | null = null

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element
}

function getHighlightElement() {
  let highlightElement = document.getElementById(HIGHLIGHT_ID)
  if (highlightElement) return highlightElement

  highlightElement = document.createElement("div")
  highlightElement.id = HIGHLIGHT_ID
  highlightElement.setAttribute("aria-hidden", "true")
  Object.assign(highlightElement.style, {
    background: "rgba(23, 66, 98, 0.08)",
    border: "2px solid rgba(23, 66, 98, 0.88)",
    borderRadius: "8px",
    boxShadow: "0 12px 24px rgba(23, 66, 98, 0.18)",
    display: "none",
    left: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    transform: "translateZ(0)",
    zIndex: "2147483647",
  })
  document.documentElement.appendChild(highlightElement)
  return highlightElement
}

function hideHighlight() {
  const highlightElement = document.getElementById(HIGHLIGHT_ID)
  if (!highlightElement) return
  highlightElement.style.display = "none"
}

function ensureFitStyle() {
  let fitStyle = document.getElementById(FIT_STYLE_ID) as HTMLStyleElement | null
  if (fitStyle) return fitStyle

  fitStyle = document.createElement("style")
  fitStyle.id = FIT_STYLE_ID
  fitStyle.textContent = `
    html {
      overflow: hidden !important;
      scrollbar-width: none !important;
      zoom: var(--desktop-preview-scale, 1) !important;
    }

    html::-webkit-scrollbar,
    body::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }

    body {
      overflow: hidden !important;
    }
  `
  document.head.appendChild(fitStyle)
  return fitStyle
}

function measureNaturalDocumentSize() {
  const html = document.documentElement
  const body = document.body
  const previousScale = html.style.getPropertyValue("--desktop-preview-scale")
  html.style.setProperty("--desktop-preview-scale", "1")

  const width = Math.max(
    window.innerWidth,
    html.clientWidth,
    html.scrollWidth,
    html.offsetWidth,
    body?.clientWidth ?? 0,
    body?.scrollWidth ?? 0,
    body?.offsetWidth ?? 0,
  )
  const height = Math.max(
    window.innerHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight,
    body?.clientHeight ?? 0,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
  )

  if (previousScale) {
    html.style.setProperty("--desktop-preview-scale", previousScale)
  } else {
    html.style.removeProperty("--desktop-preview-scale")
  }

  return { height, width }
}

function applyAutoFit() {
  if (isApplyingFit || !document.body) return

  isApplyingFit = true
  try {
    ensureFitStyle()
    const { height, width } = measureNaturalDocumentSize()
    const nextScale = clamp(
      Math.min(window.innerWidth / Math.max(width, 1), window.innerHeight / Math.max(height, 1), 1),
      MIN_SCALE,
      1,
    )

    if (Math.abs(nextScale - currentScale) > SCALE_EPSILON) {
      currentScale = nextScale
      document.documentElement.style.setProperty("--desktop-preview-scale", nextScale.toString())
    }

    sendPageMeta()
  } catch (error) {
    reportPreviewError(error)
  } finally {
    isApplyingFit = false
  }
}

function scheduleAutoFit() {
  if (fitFrame) {
    window.cancelAnimationFrame(fitFrame)
  }

  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = 0
    applyAutoFit()
  })
}

function isInteractiveElement(element: Element) {
  if (element.closest("a[href]")) return true
  if (element.closest("button")) return true
  if (element.closest("summary")) return true
  if (element.closest("label")) return true
  if (element.closest("[role='button']")) return true
  return Boolean(element.closest("input, select, textarea"))
}

function resolveInspectableElement(target: EventTarget | null) {
  if (!isElement(target)) return null

  const highlightElement = document.getElementById(HIGHLIGHT_ID)
  if (highlightElement?.contains(target)) return null

  return target.closest(
    "a, button, summary, label, input, select, textarea, [role='button'], section, article, nav, header, footer, main, h1, h2, h3, h4, h5, h6, p, img, video, svg, div, span",
  )
}

function getElementText(element: Element) {
  const rawText = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    "alt" in element ? element.getAttribute("alt") : null,
    "value" in element ? String((element as HTMLInputElement).value || "") : null,
    element.textContent,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return rawText.slice(0, 96) || undefined
}

function getElementClassTokens(element: Element) {
  const className = element.className

  if (typeof className === "string") {
    return className.split(/\s+/).filter(Boolean)
  }

  if (typeof (className as { baseVal?: unknown })?.baseVal === "string") {
    return (className as { baseVal: string }).baseVal.split(/\s+/).filter(Boolean)
  }

  return []
}

function buildElementSelector(element: Element) {
  const segments: string[] = []
  let current: Element | null = element

  while (current && segments.length < 5) {
    const tagName = current.tagName.toLowerCase()
    if (current.id) {
      segments.unshift(`${tagName}#${current.id}`)
      break
    }

    const className = getElementClassTokens(current)
      .slice(0, 2)
      .join(".")
    const siblingIndex = current.parentElement
      ? Array.from(current.parentElement.children)
          .filter((child) => child.tagName === current?.tagName)
          .indexOf(current) + 1
      : 0
    const suffix = className ? `.${className}` : siblingIndex > 0 ? `:nth-of-type(${siblingIndex})` : ""
    segments.unshift(`${tagName}${suffix}`)
    current = current.parentElement
  }

  return segments.join(" > ")
}

function reportPreviewError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  ipcRenderer.sendToHost("preview:error", { message })
}

function formatElementLabel(element: Element) {
  const tagName = element.tagName.toLowerCase()
  const text = getElementText(element)
  const role = element.getAttribute("role")

  if (text) {
    if (tagName === "a") return `Link "${text}"`
    if (tagName === "button" || role === "button") return `Button "${text}"`
    if (/^h[1-6]$/.test(tagName)) return `Heading "${text}"`
    return `${tagName} "${text}"`
  }

  if (role) return `${role} element`
  return `<${tagName}>`
}

function highlightElement(element: Element | null) {
  if (currentMode !== "comment" || !element) {
    hideHighlight()
    return
  }

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    hideHighlight()
    return
  }

  const highlightElement = getHighlightElement()
  Object.assign(highlightElement.style, {
    display: "block",
    height: `${rect.height}px`,
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
  })
}

function sendPageMeta() {
  ipcRenderer.sendToHost("preview:page-meta", {
    title: document.title || location.href,
    url: location.href,
  })
}

function handleDocumentClick(event: MouseEvent) {
  try {
    const element = resolveInspectableElement(event.target)
    if (!element || !isInteractiveElement(element)) {
      if (currentMode !== "comment") return
    }

    event.preventDefault()
    event.stopPropagation()

    if (currentMode !== "comment" || !element) {
      const href = element?.closest("a[href]")?.getAttribute("href")
      if (href) {
        ipcRenderer.sendToHost("preview:navigation-blocked", {
          href,
        })
      }
      return
    }

    const rect = element.getBoundingClientRect()
    const x = clamp(((rect.left + rect.width / 2) / Math.max(window.innerWidth, 1)) * 100, 0, 100)
    const y = clamp(((rect.top + rect.height / 2) / Math.max(window.innerHeight, 1)) * 100, 0, 100)

    ipcRenderer.sendToHost("preview:comment-target", {
      anchor: {
        type: "element",
        label: formatElementLabel(element),
        selector: buildElementSelector(element),
        tagName: element.tagName.toLowerCase(),
        text: getElementText(element),
      },
      x,
      y,
    })
  } catch (error) {
    reportPreviewError(error)
  }
}

function handleDocumentSubmit(event: Event) {
  event.preventDefault()
  event.stopPropagation()
}

function handleDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return

  const element = resolveInspectableElement(event.target)
  if (!element || !isInteractiveElement(element)) return

  event.preventDefault()
  event.stopPropagation()
}

function handleDocumentMouseMove(event: MouseEvent) {
  try {
    highlightElement(resolveInspectableElement(event.target))
  } catch (error) {
    reportPreviewError(error)
  }
}

window.addEventListener("DOMContentLoaded", () => {
  getHighlightElement()
  ensureFitStyle()
  document.addEventListener("click", handleDocumentClick, true)
  document.addEventListener("submit", handleDocumentSubmit, true)
  document.addEventListener("keydown", handleDocumentKeyDown, true)
  document.addEventListener("mousemove", handleDocumentMouseMove, true)
  fitResizeObserver?.disconnect()
  fitResizeObserver = new ResizeObserver(() => {
    scheduleAutoFit()
  })
  fitResizeObserver.observe(document.documentElement)
  if (document.body) {
    fitResizeObserver.observe(document.body)
  }
  scheduleAutoFit()
  window.setTimeout(scheduleAutoFit, 120)
  window.setTimeout(scheduleAutoFit, 360)
  sendPageMeta()
  ipcRenderer.sendToHost("preview:ready")
})

window.addEventListener("load", () => {
  scheduleAutoFit()
  sendPageMeta()
})

window.addEventListener("resize", scheduleAutoFit)

ipcRenderer.on("preview:set-mode", (_event, payload: { mode?: PreviewMode } | undefined) => {
  currentMode = payload?.mode === "comment" ? "comment" : "browse"
  if (currentMode !== "comment") {
    hideHighlight()
  }
})
