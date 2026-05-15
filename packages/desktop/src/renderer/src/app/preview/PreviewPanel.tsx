import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import type { DesktopLocalPreviewService } from "../../../../shared/desktop-ipc-contract"
import { BackIcon, ForwardIcon, OpenExternalIcon, ResetIcon, SideChatIcon } from "../icons"
import type { PreviewComment, PreviewErrorKind, PreviewMode, WorkspacePreviewState } from "../types"
import { clamp } from "../utils"

const PREVIEW_QUICK_URLS = ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"] as const

interface PendingPreviewComment {
  x: number
  y: number
  anchor?: PreviewComment["anchor"]
}

interface PreviewHoverTarget {
  anchor?: PreviewComment["anchor"]
  className: string
  color?: string
  dimensions: string
  fontFamily?: string
  fontSize?: string
  height: string
  label: string
  left: string
  top: string
  tooltipLeft: string
  tooltipPlacement: "is-left" | "is-right"
  tooltipTop: string
  width: string
  x: number
  y: number
}

interface PreviewPanelProps {
  state: WorkspacePreviewState
  onAddComment: (input: {
    frame?: string
    nodePosition?: string
    pageUrl?: string
    screenshotPath?: string | null
    x: number
    y: number
    text: string
    anchor?: PreviewComment["anchor"]
  }) => void
  onBack: () => void
  onDraftUrlChange: (value: string) => void
  onForward: () => void
  onModeChange: (mode: PreviewMode) => void
  onOpen: () => void
  onOpenExternal: () => void | Promise<void>
  onOpenUrl: (url: string) => void
  onReload: () => void
}

interface WebviewElement extends HTMLElement {
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
  reload?: () => void
  send?: (channel: string, payload?: unknown) => void
}

type WebviewIpcMessageEvent = Event & {
  args: unknown[]
  channel: string
}

type WebviewFailLoadEvent = Event & {
  errorCode?: number
  errorDescription?: string
  isMainFrame?: boolean
}

type PreviewGuestInspectionResult = {
  anchor?: PreviewComment["anchor"]
  color?: string
  dimensions?: string
  fontFamily?: string
  fontSize?: string
  rect?: {
    bottom: number
    height: number
    left: number
    top: number
    width: number
  }
}

type PreviewLoadError = {
  code: string
  kind: PreviewErrorKind
  message: string
  suggestions: string[]
}

export function getPreviewFailure(errorDescription?: string, errorCode?: number): PreviewLoadError {
  const message = (errorDescription ?? "").trim()
  if (/ERR_BLOCKED_BY_RESPONSE/i.test(message) || errorCode === -27) {
    return {
      code: "ERR_BLOCKED_BY_RESPONSE",
      kind: "embedded-blocked",
      message: "This page does not allow being shown inside the preview window.",
      suggestions: ["Open it in your browser.", "Check whether the site blocks embedding with response headers."],
    }
  }
  if (/ERR_CONNECTION_REFUSED/i.test(message) || errorCode === -102) {
    return {
      code: "ERR_CONNECTION_REFUSED",
      kind: "connection-refused",
      message: "No service is listening at this address.",
      suggestions: ["Start your local dev server.", "Check that the host and port in the URL are correct."],
    }
  }
  if (/ERR_NAME_NOT_RESOLVED/i.test(message) || errorCode === -105) {
    return {
      code: "ERR_NAME_NOT_RESOLVED",
      kind: "dns",
      message: "The preview host could not be resolved.",
      suggestions: ["Check the hostname.", "Check your proxy, DNS, or network settings."],
    }
  }
  if (/ERR_CONNECTION_RESET/i.test(message) || errorCode === -101) {
    return {
      code: "ERR_CONNECTION_RESET",
      kind: "connection-reset",
      message: "The preview connection was reset before the page loaded.",
      suggestions: ["Reload the preview.", "Check whether the local service restarted or crashed."],
    }
  }
  if (/ERR_EMPTY_RESPONSE/i.test(message) || errorCode === -324) {
    return {
      code: "ERR_EMPTY_RESPONSE",
      kind: "connection-reset",
      message: "The preview service accepted the connection but returned an empty response.",
      suggestions: ["Restart the local dev server.", "Check server logs for crashes or early connection closes."],
    }
  }
  if (/ERR_TIMED_OUT|TIMEOUT/i.test(message) || errorCode === -7) {
    return {
      code: "ERR_TIMED_OUT",
      kind: "timeout",
      message: "The preview URL timed out before it responded.",
      suggestions: ["Reload the preview.", "Check whether the local service is still starting."],
    }
  }
  if (/ERR_CERT|CERT_|SSL/i.test(message)) {
    return {
      code: message || "ERR_CERTIFICATE",
      kind: "certificate",
      message: "The preview URL has a certificate problem.",
      suggestions: ["Open it externally to inspect the certificate.", "Use http:// for local development if HTTPS is not required."],
    }
  }

  return {
    code: message || "ERR_PREVIEW_LOAD_FAILED",
    kind: "unknown",
    message: "This page could not be opened inside the preview window.",
    suggestions: ["Reload the preview.", "Open it externally to inspect the browser error."],
  }
}

function getPreviewHostLabel(url: string | null) {
  if (!url) return "This site"
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function getPendingComposerPlacement(x: number) {
  if (x < 38) return "is-right"
  if (x > 62) return "is-left"
  return "is-center"
}

function getPointerTooltipPosition(
  overlayBounds: DOMRect,
  clientX: number,
  clientY: number,
): Pick<PreviewHoverTarget, "tooltipLeft" | "tooltipPlacement" | "tooltipTop"> {
  const tooltipWidth = 260
  const tooltipHeight = 88
  const cursorOffset = 12
  const viewportPadding = 8
  const overlayWidth = Math.max(overlayBounds.width, 1)
  const overlayHeight = Math.max(overlayBounds.height, 1)
  const localX = clamp(clientX - overlayBounds.left, 0, overlayWidth)
  const localY = clamp(clientY - overlayBounds.top, 0, overlayHeight)
  const canPlaceRight = localX + cursorOffset + tooltipWidth <= overlayWidth - viewportPadding
  const canPlaceLeft = localX - cursorOffset - tooltipWidth >= viewportPadding
  const tooltipPlacement = canPlaceRight || !canPlaceLeft ? "is-right" : "is-left"
  const tooltipLeft =
    tooltipPlacement === "is-left"
      ? clamp(localX - cursorOffset, tooltipWidth + viewportPadding, overlayWidth - viewportPadding)
      : clamp(localX + cursorOffset, viewportPadding, Math.max(viewportPadding, overlayWidth - tooltipWidth - viewportPadding))
  const tooltipTop =
    localY + cursorOffset + tooltipHeight > overlayHeight - viewportPadding
      ? Math.max(viewportPadding, localY - tooltipHeight - cursorOffset)
      : localY + cursorOffset

  return {
    tooltipLeft: `${tooltipLeft}px`,
    tooltipPlacement,
    tooltipTop: `${tooltipTop}px`,
  }
}

function isElement(value: unknown): value is Element {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Partial<Element>).nodeType === 1 &&
      typeof (value as Partial<Element>).tagName === "string",
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

function buildElementPath(element: Element) {
  const segments: string[] = []
  let current: Element | null = element

  while (current && segments.length < 8) {
    const tagName = current.tagName.toLowerCase()
    const siblingIndex = current.parentElement
      ? Array.from(current.parentElement.children).indexOf(current) + 1
      : 1
    segments.unshift(`${tagName}:nth-child(${siblingIndex})`)
    current = current.parentElement
  }

  return segments.join(" > ")
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

function formatCssColor(value: string) {
  const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return value || "transparent"

  const [, red, green, blue] = match
  return [red, green, blue]
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .replace(/^/, "#")
}

function formatFontFamily(value: string) {
  const firstFamily = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)[0]
  return firstFamily || "inherit"
}

function createCoordinateHoverTarget(x: number, y: number): PreviewHoverTarget {
  const roundedX = Math.round(x)
  const roundedY = Math.round(y)
  return {
    anchor: { type: "coordinate" },
    className: "is-coordinate",
    dimensions: "coordinate",
    height: "20px",
    label: `${roundedX}%, ${roundedY}%`,
    left: `${x}%`,
    top: `${y}%`,
    tooltipLeft: `${x}%`,
    tooltipPlacement: "is-right",
    tooltipTop: `calc(${y}% + 12px)`,
    width: "20px",
    x,
    y,
  }
}

function createCoordinateHoverTargetFromBounds(
  overlayBounds: DOMRect,
  clientX: number,
  clientY: number,
): PreviewHoverTarget {
  const overlayWidth = Math.max(overlayBounds.width, 1)
  const overlayHeight = Math.max(overlayBounds.height, 1)
  const overlayLocalX = clamp(clientX - overlayBounds.left, 0, overlayWidth)
  const overlayLocalY = clamp(clientY - overlayBounds.top, 0, overlayHeight)
  const x = clamp((overlayLocalX / overlayWidth) * 100, 0, 100)
  const y = clamp((overlayLocalY / overlayHeight) * 100, 0, 100)

  return {
    ...createCoordinateHoverTarget(x, y),
    ...getPointerTooltipPosition(overlayBounds, clientX, clientY),
  }
}

function isPreviewGuestInspectionResult(value: unknown): value is PreviewGuestInspectionResult {
  return Boolean(value && typeof value === "object")
}

function createWebviewInspectionScript(clientX: number, clientY: number) {
  return `
    (() => {
      const clientX = ${JSON.stringify(clientX)};
      const clientY = ${JSON.stringify(clientY)};
      const clampText = (value) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 96) || undefined;
      const getText = (element) => clampText([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        "alt" in element ? element.getAttribute("alt") : null,
        "value" in element ? element.value : null,
        element.textContent
      ].filter(Boolean).join(" "));
      const classTokens = (element) => {
        const className = element.className;
        if (typeof className === "string") return className.split(/\\s+/).filter(Boolean);
        if (className && typeof className.baseVal === "string") return className.baseVal.split(/\\s+/).filter(Boolean);
        return [];
      };
      const selectorFor = (element) => {
        const segments = [];
        let current = element;
        while (current && segments.length < 5) {
          const tagName = current.tagName.toLowerCase();
          if (current.id) {
            segments.unshift(tagName + "#" + current.id);
            break;
          }
          const classes = classTokens(current).slice(0, 2).join(".");
          const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
            : [];
          const index = siblings.indexOf(current) + 1;
          const suffix = classes ? "." + classes : index > 0 ? ":nth-of-type(" + index + ")" : "";
          segments.unshift(tagName + suffix);
          current = current.parentElement;
        }
        return segments.join(" > ");
      };
      const pathFor = (element) => {
        const segments = [];
        let current = element;
        while (current && segments.length < 8) {
          const tagName = current.tagName.toLowerCase();
          const index = current.parentElement ? Array.from(current.parentElement.children).indexOf(current) + 1 : 1;
          segments.unshift(tagName + ":nth-child(" + index + ")");
          current = current.parentElement;
        }
        return segments.join(" > ");
      };
      const labelFor = (element) => {
        const tagName = element.tagName.toLowerCase();
        const text = getText(element);
        const role = element.getAttribute("role");
        if (text) {
          if (tagName === "a") return "Link \\"" + text + "\\"";
          if (tagName === "button" || role === "button") return "Button \\"" + text + "\\"";
          if (/^h[1-6]$/.test(tagName)) return "Heading \\"" + text + "\\"";
          return tagName + " \\"" + text + "\\"";
        }
        if (role) return role + " element";
        return "<" + tagName + ">";
      };
      const formatColor = (value) => {
        const match = String(value || "").match(/^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
        if (!match) return value || "transparent";
        return "#" + [match[1], match[2], match[3]]
          .map((channel) => Number(channel).toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      };
      const formatFamily = (value) => String(value || "").split(",").map((part) => part.trim()).filter(Boolean)[0] || "inherit";
      const element = document.elementFromPoint(clientX, clientY)?.closest(
        "a, button, summary, label, input, select, textarea, [role='button'], section, article, nav, header, footer, main, h1, h2, h3, h4, h5, h6, p, img, video, svg, div, span"
      );
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const style = getComputedStyle(element);
      const tagName = element.tagName.toLowerCase();
      const text = getText(element);
      return {
        anchor: {
          type: "element",
          label: labelFor(element),
          path: pathFor(element),
          rect: {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width
          },
          selector: selectorFor(element),
          tagName,
          text
        },
        color: formatColor(style.color),
        dimensions: Math.round(rect.width) + "x" + Math.round(rect.height),
        fontFamily: formatFamily(style.fontFamily),
        fontSize: style.fontSize,
        rect: {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width
        }
      };
    })()
  `
}

function createHoverTargetFromGuestInspection(
  guestResult: unknown,
  fallbackTarget: PreviewHoverTarget,
  overlayBounds: DOMRect,
  frameBounds: DOMRect,
) {
  if (!isPreviewGuestInspectionResult(guestResult) || !guestResult.rect) {
    return fallbackTarget
  }

  const overlayWidth = Math.max(overlayBounds.width, 1)
  const overlayHeight = Math.max(overlayBounds.height, 1)
  const rect = guestResult.rect
  const anchor = guestResult.anchor
    ? {
        ...guestResult.anchor,
        rect: guestResult.anchor.rect ?? {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        },
      }
    : undefined
  const elementLeft = frameBounds.left - overlayBounds.left + rect.left
  const elementTop = frameBounds.top - overlayBounds.top + rect.top
  const label = anchor?.label ?? fallbackTarget.label

  return {
    anchor,
    className: "is-element",
    color: guestResult.color,
    dimensions: guestResult.dimensions ?? `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    fontFamily: guestResult.fontFamily,
    fontSize: guestResult.fontSize,
    height: `${(rect.height / overlayHeight) * 100}%`,
    label,
    left: `${(elementLeft / overlayWidth) * 100}%`,
    top: `${(elementTop / overlayHeight) * 100}%`,
    tooltipLeft: fallbackTarget.tooltipLeft,
    tooltipPlacement: fallbackTarget.tooltipPlacement,
    tooltipTop: fallbackTarget.tooltipTop,
    width: `${(rect.width / overlayWidth) * 100}%`,
    x: fallbackTarget.x,
    y: fallbackTarget.y,
  } satisfies PreviewHoverTarget
}

async function resolveWebviewHoverTarget(
  webview: WebviewElement | null,
  overlayBounds: DOMRect,
  clientX: number,
  clientY: number,
) {
  const fallbackTarget = createCoordinateHoverTargetFromBounds(overlayBounds, clientX, clientY)
  const frameBounds = webview?.getBoundingClientRect()
  if (!webview?.executeJavaScript || !frameBounds) return fallbackTarget

  const frameWidth = Math.max(frameBounds.width, 1)
  const frameHeight = Math.max(frameBounds.height, 1)
  const frameLocalX = clamp(clientX - frameBounds.left, 0, frameWidth)
  const frameLocalY = clamp(clientY - frameBounds.top, 0, frameHeight)

  try {
    const guestResult = await webview.executeJavaScript(
      createWebviewInspectionScript(frameLocalX, frameLocalY),
      true,
    )
    return createHoverTargetFromGuestInspection(guestResult, fallbackTarget, overlayBounds, frameBounds)
  } catch {
    return fallbackTarget
  }
}

function resolveIframeHoverTarget(
  iframe: HTMLIFrameElement | null,
  overlayBounds: DOMRect,
  clientX: number,
  clientY: number,
): PreviewHoverTarget {
  const overlayWidth = Math.max(overlayBounds.width, 1)
  const overlayHeight = Math.max(overlayBounds.height, 1)
  const fallbackTarget = createCoordinateHoverTargetFromBounds(overlayBounds, clientX, clientY)

  try {
    const frameBounds = iframe?.getBoundingClientRect()
    if (!frameBounds) return fallbackTarget

    const frameWidth = Math.max(frameBounds.width, 1)
    const frameHeight = Math.max(frameBounds.height, 1)
    const frameLocalX = clamp(clientX - frameBounds.left, 0, frameWidth)
    const frameLocalY = clamp(clientY - frameBounds.top, 0, frameHeight)
    const frameDocument = iframe?.contentDocument
    const element = frameDocument?.elementFromPoint(frameLocalX, frameLocalY)
    if (!isElement(element)) return fallbackTarget

    const elementBounds = element.getBoundingClientRect()
    if (elementBounds.width <= 0 || elementBounds.height <= 0) {
      return fallbackTarget
    }

    const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element)
    const anchor: PreviewComment["anchor"] = {
      type: "element",
      label: formatElementLabel(element),
      path: buildElementPath(element),
      rect: {
        bottom: elementBounds.bottom,
        height: elementBounds.height,
        left: elementBounds.left,
        right: elementBounds.right,
        top: elementBounds.top,
        width: elementBounds.width,
      },
      selector: buildElementSelector(element),
      tagName: element.tagName.toLowerCase(),
      text: getElementText(element),
    }
    const elementLeft = frameBounds.left - overlayBounds.left + elementBounds.left
    const elementTop = frameBounds.top - overlayBounds.top + elementBounds.top

    return {
      anchor,
      className: "is-element",
      color: computedStyle ? formatCssColor(computedStyle.color) : undefined,
      dimensions: `${Math.round(elementBounds.width)}x${Math.round(elementBounds.height)}`,
      fontFamily: computedStyle ? formatFontFamily(computedStyle.fontFamily) : undefined,
      fontSize: computedStyle?.fontSize,
      height: `${(elementBounds.height / overlayHeight) * 100}%`,
      label: anchor.label ?? fallbackTarget.label,
      left: `${(elementLeft / overlayWidth) * 100}%`,
      top: `${(elementTop / overlayHeight) * 100}%`,
      tooltipLeft: fallbackTarget.tooltipLeft,
      tooltipPlacement: fallbackTarget.tooltipPlacement,
      tooltipTop: fallbackTarget.tooltipTop,
      width: `${(elementBounds.width / overlayWidth) * 100}%`,
      x: fallbackTarget.x,
      y: fallbackTarget.y,
    }
  } catch {
    return fallbackTarget
  }
}

// Legacy URL review panel kept for migration reference and tests.
// The active right-sidebar Preview tab is UnifiedPreviewPanel.
export function PreviewPanel({
  state,
  onAddComment,
  onBack,
  onDraftUrlChange,
  onForward,
  onModeChange,
  onOpen,
  onOpenExternal,
  onOpenUrl,
  onReload,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<WebviewElement | null>(null)
  const hoverRequestIDRef = useRef(0)
  const previewLoadErrorRef = useRef<PreviewLoadError | null>(null)
  const localServiceRequestIDRef = useRef(0)
  const localServiceAutoScanRef = useRef(false)
  const previewGuestPreloadPath = window.desktop?.previewGuestPreloadPath
  const canUseWebview = useMemo(
    () =>
      /Electron/i.test(globalThis.navigator?.userAgent ?? "") &&
      typeof previewGuestPreloadPath === "string" &&
      previewGuestPreloadPath.startsWith("file:"),
    [previewGuestPreloadPath],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isWebviewReady, setIsWebviewReady] = useState(false)
  const [forceIframeFallback, setForceIframeFallback] = useState(false)
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [pendingComment, setPendingComment] = useState<PendingPreviewComment | null>(null)
  const [pendingText, setPendingText] = useState("")
  const [hoverTarget, setHoverTarget] = useState<PreviewHoverTarget | null>(null)
  const [localPreviewServices, setLocalPreviewServices] = useState<DesktopLocalPreviewService[]>([])
  const [localServiceStatus, setLocalServiceStatus] = useState<"idle" | "scanning" | "ready" | "error">("idle")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [previewLoadError, setPreviewLoadError] = useState<PreviewLoadError | null>(null)
  const shouldUseWebview = canUseWebview && !forceIframeFallback
  const navigationHistory = Array.isArray(state.navigationHistory)
    ? state.navigationHistory
    : state.committedUrl
      ? [state.committedUrl]
      : []
  const navigationIndex = Number.isInteger(state.navigationIndex)
    ? state.navigationIndex
    : navigationHistory.length - 1
  const canGoBack = navigationIndex > 0
  const canGoForward = navigationIndex >= 0 && navigationIndex < navigationHistory.length - 1
  const shouldRenderPreviewDocument = !previewLoadError
  const currentComments = state.committedUrl
    ? state.comments.filter((comment) => comment.url === state.committedUrl)
    : []
  const hasDraftPreviewUrl = Boolean((state.draftUrl || state.committedUrl || "").trim())
  const pendingCommentStyle = pendingComment
    ? {
        "--preview-comment-x": `${pendingComment.x}%`,
        "--preview-comment-y": `${pendingComment.y}%`,
      } as CSSProperties
    : undefined
  const hoverTargetStyle = hoverTarget
    ? {
        "--preview-hover-height": hoverTarget.height,
        "--preview-hover-left": hoverTarget.left,
        "--preview-hover-tooltip-left": hoverTarget.tooltipLeft,
        "--preview-hover-tooltip-top": hoverTarget.tooltipTop,
        "--preview-hover-top": hoverTarget.top,
        "--preview-hover-width": hoverTarget.width,
      } as CSSProperties
    : undefined

  useEffect(() => {
    return () => {
      localServiceRequestIDRef.current += 1
    }
  }, [])

  function getPreviewFrameLabel() {
    return shouldUseWebview ? "webview" : "iframe"
  }

  function setCurrentPreviewLoadError(error: PreviewLoadError | null) {
    previewLoadErrorRef.current = error
    setPreviewLoadError(error)
  }

  function formatNodePosition(comment: PendingPreviewComment) {
    const rect = comment.anchor?.rect
    const coordinate = `${Math.round(comment.x)}%, ${Math.round(comment.y)}%`
    if (!rect) return coordinate

    return `${coordinate}; target rect ${Math.round(rect.left)}, ${Math.round(rect.top)}, ${Math.round(rect.width)}x${Math.round(rect.height)}`
  }

  async function capturePreviewScreenshotPath() {
    const capturePreviewScreenshot = window.desktop?.capturePreviewScreenshot
    const bounds = overlayRef.current?.getBoundingClientRect()
    if (!capturePreviewScreenshot || !bounds || bounds.width <= 0 || bounds.height <= 0) return null

    try {
      const result = await capturePreviewScreenshot({
        bounds: {
          height: Math.round(bounds.height),
          width: Math.round(bounds.width),
          x: Math.round(bounds.left),
          y: Math.round(bounds.top),
        },
        ...(state.committedUrl ? { url: state.committedUrl } : {}),
      })

      return result.path.trim() || null
    } catch (error) {
      console.error("[preview] failed to capture comment screenshot:", error)
      return null
    }
  }

  async function scanLocalPreviewServices() {
    const detectLocalPreviewServices = window.desktop?.detectLocalPreviewServices
    const requestID = localServiceRequestIDRef.current + 1
    localServiceRequestIDRef.current = requestID

    if (!detectLocalPreviewServices) {
      setLocalPreviewServices([])
      setLocalServiceStatus("error")
      return
    }

    setLocalServiceStatus("scanning")
    try {
      const services = await detectLocalPreviewServices()
      if (localServiceRequestIDRef.current !== requestID) return
      setLocalPreviewServices(services)
      setLocalServiceStatus("ready")
    } catch (error) {
      if (localServiceRequestIDRef.current !== requestID) return
      console.error("[preview] failed to detect local preview services:", error)
      setLocalPreviewServices([])
      setLocalServiceStatus("error")
    }
  }

  useEffect(() => {
    if (!state.committedUrl) {
      setIsLoading(false)
      setIsWebviewReady(false)
      setForceIframeFallback(false)
      setPendingComment(null)
      setPendingText("")
      setHoverTarget(null)
      setStatusMessage(null)
      setCurrentPreviewLoadError(null)
      return
    }

    setIsLoading(true)
    setIsWebviewReady(false)
    setForceIframeFallback(false)
    setStatusMessage(null)
    setCurrentPreviewLoadError(null)
    setPendingComment(null)
    setPendingText("")
    setHoverTarget(null)
  }, [state.committedUrl, state.reloadToken])

  useEffect(() => {
    if (state.committedUrl || localServiceAutoScanRef.current) return

    localServiceAutoScanRef.current = true
    void scanLocalPreviewServices()
  }, [state.committedUrl])

  useEffect(() => {
    if (state.mode !== "comment") {
      setHoverTarget(null)
    }
  }, [state.mode])

  useEffect(() => {
    if (!shouldUseWebview || !state.committedUrl) return

    const activeWebview = webviewRef.current
    if (!activeWebview) return
    const readyWebview: WebviewElement = activeWebview

    function handleDomReady() {
      if (previewLoadErrorRef.current) {
        setIsLoading(false)
        return
      }

      setIsWebviewReady(true)
      setStatusMessage(null)
      setCurrentPreviewLoadError(null)
      setIsLoading(false)
      try {
        readyWebview.send?.("preview:set-mode", { mode: state.mode })
      } catch (error) {
        console.error("[preview] failed to sync mode after webview dom-ready", error)
      }
    }

    function handleDidStartLoading() {
      setIsLoading(true)
      setCurrentPreviewLoadError(null)
    }

    function handleDidStopLoading() {
      setIsLoading(false)
    }

    function handleWillNavigate(rawEvent: Event) {
      rawEvent.preventDefault?.()
      setStatusMessage("Links are disabled in preview mode.")
    }

    function handleDidFailLoad(rawEvent: Event) {
      const event = rawEvent as WebviewFailLoadEvent
      if (event.isMainFrame === false) return
      if (event.errorCode === -3) return
      setIsLoading(false)
      setIsWebviewReady(false)
      setCurrentPreviewLoadError(getPreviewFailure(event.errorDescription, event.errorCode))
    }

    function handleIpcMessage(rawEvent: Event) {
      const event = rawEvent as WebviewIpcMessageEvent
      const payload = event.args[0] as Record<string, unknown> | undefined

      switch (event.channel) {
        case "preview:page-meta":
          return
        case "preview:ready":
          setIsWebviewReady(true)
          try {
            readyWebview.send?.("preview:set-mode", { mode: state.mode })
          } catch (error) {
            console.error("[preview] failed to sync mode after preview ready", error)
          }
          return
        case "preview:navigation-blocked":
          setStatusMessage("Links are disabled in preview mode.")
          return
        case "preview:error":
          if (typeof payload?.message === "string" && payload.message.trim()) {
            setStatusMessage(`Preview script error: ${payload.message}`)
          }
          return
        case "preview:comment-target":
          setPendingComment({
            x: typeof payload?.x === "number" ? payload.x : 50,
            y: typeof payload?.y === "number" ? payload.y : 50,
            anchor: payload?.anchor as PreviewComment["anchor"] | undefined,
          })
          setPendingText("")
          return
      }
    }

    readyWebview.addEventListener("dom-ready", handleDomReady as EventListener)
    readyWebview.addEventListener("did-start-loading", handleDidStartLoading as EventListener)
    readyWebview.addEventListener("did-stop-loading", handleDidStopLoading as EventListener)
    readyWebview.addEventListener("did-fail-load", handleDidFailLoad as EventListener)
    readyWebview.addEventListener("will-navigate", handleWillNavigate as EventListener)
    readyWebview.addEventListener("new-window", handleWillNavigate as EventListener)
    readyWebview.addEventListener("ipc-message", handleIpcMessage as EventListener)

    return () => {
      readyWebview.removeEventListener("dom-ready", handleDomReady as EventListener)
      readyWebview.removeEventListener("did-start-loading", handleDidStartLoading as EventListener)
      readyWebview.removeEventListener("did-stop-loading", handleDidStopLoading as EventListener)
      readyWebview.removeEventListener("did-fail-load", handleDidFailLoad as EventListener)
      readyWebview.removeEventListener("will-navigate", handleWillNavigate as EventListener)
      readyWebview.removeEventListener("new-window", handleWillNavigate as EventListener)
      readyWebview.removeEventListener("ipc-message", handleIpcMessage as EventListener)
    }
  }, [shouldUseWebview, state.committedUrl, state.mode, state.reloadToken])

  useEffect(() => {
    if (!shouldUseWebview || !state.committedUrl || !isWebviewReady) return

    try {
      webviewRef.current?.send?.("preview:set-mode", { mode: state.mode })
    } catch (error) {
      console.error("[preview] failed to sync mode", error)
    }
  }, [shouldUseWebview, isWebviewReady, state.committedUrl, state.mode])

  useEffect(() => {
    if (!canUseWebview || forceIframeFallback || !state.committedUrl || isWebviewReady) return

    const timer = globalThis.setTimeout(() => {
      setForceIframeFallback(true)
      setIsLoading(false)
      setStatusMessage("The embedded webview did not initialize. Falling back to iframe mode.")
    }, 2500)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [canUseWebview, forceIframeFallback, isWebviewReady, state.committedUrl, state.reloadToken])

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (state.mode !== "comment" || !state.committedUrl) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (shouldUseWebview) {
      const fallbackTarget = createCoordinateHoverTargetFromBounds(bounds, event.clientX, event.clientY)
      setPendingComment({
        x: fallbackTarget.x,
        y: fallbackTarget.y,
        anchor: fallbackTarget.anchor,
      })
      setPendingText("")

      void resolveWebviewHoverTarget(webviewRef.current, bounds, event.clientX, event.clientY).then((target) => {
        setPendingComment((current) => {
          if (!current) return current
          if (Math.abs(current.x - fallbackTarget.x) > 0.01 || Math.abs(current.y - fallbackTarget.y) > 0.01) {
            return current
          }
          return {
            x: target.x,
            y: target.y,
            anchor: target.anchor,
          }
        })
      })
      return
    }

    const target = resolveIframeHoverTarget(iframeRef.current, bounds, event.clientX, event.clientY)

    setPendingComment({
      x: target.x,
      y: target.y,
      anchor: target.anchor,
    })
    setPendingText("")
  }

  function handleOverlayMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (state.mode !== "comment" || !state.committedUrl) return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (shouldUseWebview) {
      const requestID = hoverRequestIDRef.current + 1
      hoverRequestIDRef.current = requestID
      setHoverTarget(createCoordinateHoverTargetFromBounds(bounds, event.clientX, event.clientY))
      void resolveWebviewHoverTarget(webviewRef.current, bounds, event.clientX, event.clientY).then((target) => {
        if (hoverRequestIDRef.current === requestID) {
          setHoverTarget(target)
        }
      })
      return
    }

    setHoverTarget(resolveIframeHoverTarget(iframeRef.current, bounds, event.clientX, event.clientY))
  }

  function handleOverlayMouseLeave() {
    hoverRequestIDRef.current += 1
    setHoverTarget(null)
  }

  async function handlePendingCommentSave() {
    if (!pendingComment || isSavingComment) return
    const text = pendingText.trim()
    if (!text) return
    setIsSavingComment(true)

    try {
      const screenshotPath = await capturePreviewScreenshotPath()
      onAddComment({
        ...pendingComment,
        frame: getPreviewFrameLabel(),
        nodePosition: formatNodePosition(pendingComment),
        pageUrl: state.committedUrl ?? undefined,
        screenshotPath,
        text,
      })
      setPendingComment(null)
      setPendingText("")
    } finally {
      setIsSavingComment(false)
    }
  }

  function handlePendingCommentCancel() {
    setPendingComment(null)
    setPendingText("")
  }

  return (
    <section className="right-sidebar-section preview-panel-section">
      <div className="preview-panel-main">
        <div className="preview-panel-controls">
          <form
            className="preview-toolbar"
            onSubmit={(event) => {
              event.preventDefault()
              onOpen()
            }}
          >
            <div className="preview-toolbar-navigation" aria-label="Preview navigation controls">
              <button
                type="button"
                className="preview-toolbar-icon-button"
                aria-label="Back"
                title="Back"
                disabled={!canGoBack}
                onClick={() => onBack()}
              >
                <BackIcon size={15} />
              </button>
              <button
                type="button"
                className="preview-toolbar-icon-button"
                aria-label="Forward"
                title="Forward"
                disabled={!canGoForward}
                onClick={() => onForward()}
              >
                <ForwardIcon size={15} />
              </button>
              <button
                type="button"
                className="preview-toolbar-icon-button"
                aria-label="Refresh"
                title="Refresh"
                disabled={!state.committedUrl}
                onClick={() => onReload()}
              >
                <ResetIcon size={14} />
              </button>
            </div>
            <label className="preview-toolbar-address">
              <input
                aria-label="Preview URL"
                className="preview-toolbar-input"
                placeholder="http://localhost:3000 or https://example.com"
                type="text"
                value={state.draftUrl}
                onChange={(event) => onDraftUrlChange(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="preview-toolbar-icon-button"
              aria-label="Open External"
              title="Open External"
              disabled={!hasDraftPreviewUrl}
              onClick={() => void onOpenExternal()}
            >
              <OpenExternalIcon size={15} />
            </button>
            <button
              type="button"
              className={state.mode === "comment" ? "preview-comment-mode-button is-active" : "preview-comment-mode-button"}
              aria-label="Comment"
              aria-pressed={state.mode === "comment"}
              title={state.mode === "comment" ? "Turn off comment mode" : "Turn on comment mode"}
              onClick={() => onModeChange(state.mode === "comment" ? "browse" : "comment")}
            >
              <SideChatIcon size={15} />
              <span>Comment</span>
            </button>
          </form>

          {state.errorMessage ? (
            <p className="right-sidebar-status-error" role="alert">{state.errorMessage}</p>
          ) : null}

          {statusMessage ? <p className="right-sidebar-status-error" role="alert">{statusMessage}</p> : null}
        </div>

        {state.committedUrl ? (
          <div className="preview-panel-preview-stack">
            <div className="preview-canvas">
              {shouldRenderPreviewDocument ? (
                <>
                  {shouldUseWebview ? (
                    <webview
                      key={`${state.committedUrl}:${state.reloadToken}`}
                      ref={(node) => {
                        webviewRef.current = node as WebviewElement | null
                      }}
                      aria-label={`Preview of ${state.committedUrl}`}
                      className="preview-frame preview-webview"
                      preload={previewGuestPreloadPath}
                      src={state.committedUrl}
                    />
                  ) : (
                    <iframe
                      key={`${state.committedUrl}:${state.reloadToken}`}
                      ref={iframeRef}
                      title={`Preview of ${state.committedUrl}`}
                      className="preview-frame"
                      sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                      src={state.committedUrl}
                      onError={() => {
                        setIsLoading(false)
                        setCurrentPreviewLoadError(getPreviewFailure())
                      }}
                      onLoad={() => {
                        setIsLoading(false)
                        setCurrentPreviewLoadError(null)
                      }}
                    />
                  )}

                  <div
                    ref={overlayRef}
                    className={state.mode === "comment" ? "preview-comment-overlay is-active" : "preview-comment-overlay"}
                    data-testid="preview-comment-overlay"
                    onClick={handleOverlayClick}
                    onMouseLeave={handleOverlayMouseLeave}
                    onMouseMove={handleOverlayMouseMove}
                  />
                </>
              ) : null}

              {shouldRenderPreviewDocument && hoverTarget ? (
                <>
                  <div
                    className={`preview-hover-highlight ${hoverTarget.className}`}
                    style={hoverTargetStyle}
                  />
                  <div
                    className={`preview-hover-tooltip ${hoverTarget.tooltipPlacement}`}
                    style={hoverTargetStyle}
                  >
                    <div className="preview-hover-tooltip-row">
                      <strong>{hoverTarget.anchor?.tagName ?? "point"}</strong>
                      <strong>{hoverTarget.className === "is-element" ? hoverTarget.dimensions : hoverTarget.label}</strong>
                    </div>
                    {hoverTarget.color ? (
                      <div className="preview-hover-tooltip-row">
                        <span>color</span>
                        <strong>{hoverTarget.color}</strong>
                      </div>
                    ) : null}
                    {hoverTarget.fontSize || hoverTarget.fontFamily ? (
                      <div className="preview-hover-tooltip-row">
                        <span>font</span>
                        <strong>{[hoverTarget.fontSize, hoverTarget.fontFamily].filter(Boolean).join(" ")}</strong>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {isLoading && shouldRenderPreviewDocument ? (
                <div className="preview-loading-scrim" aria-live="polite">
                  Loading preview...
                </div>
              ) : null}

              {previewLoadError ? (
                <div className="preview-canvas-state preview-error-state" role="alert">
                  <span className="preview-error-icon" aria-hidden="true">!</span>
                  <h3>Unable to access this preview</h3>
                  <p>{getPreviewHostLabel(state.committedUrl)} refused to load in Preview.</p>
                  <p>{previewLoadError.message}</p>
                  <div className="preview-error-details">
                    <span>Try:</span>
                    <ul>
                      {previewLoadError.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                  <code>{previewLoadError.code}</code>
                  <div className="preview-state-actions">
                    <button type="button" className="secondary-button" onClick={() => onReload()}>
                      Reload
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void onOpenExternal()}>
                      Open External
                    </button>
                  </div>
                </div>
              ) : null}

              {shouldRenderPreviewDocument && pendingComment ? (
                <div
                  className={`preview-floating-comment-composer ${getPendingComposerPlacement(pendingComment.x)}`}
                  style={pendingCommentStyle}
                >
                  <span className="preview-floating-comment-pin">{currentComments.length + 1}</span>
                  <div className="preview-floating-comment-bubble">
                    <div className="preview-comment-selection">
                      <strong>{pendingComment.anchor?.label ?? `${Math.round(pendingComment.x)}%, ${Math.round(pendingComment.y)}%`}</strong>
                      {pendingComment.anchor?.selector ? <span>{pendingComment.anchor.selector}</span> : null}
                    </div>
                    <label className="preview-comment-label">
                      <textarea
                        aria-label="Preview comment"
                        placeholder="Add comment..."
                        rows={2}
                        value={pendingText}
                        onChange={(event) => setPendingText(event.target.value)}
                      />
                    </label>
                    <div className="right-sidebar-toolbar preview-floating-comment-actions">
                      <button type="button" className="secondary-button" disabled={!pendingText.trim() || isSavingComment} onClick={() => void handlePendingCommentSave()}>
                        {isSavingComment ? "Saving" : "Save"}
                      </button>
                      <button type="button" className="secondary-button" onClick={handlePendingCommentCancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="preview-panel-preview-stack">
            <div className="preview-canvas">
              <div className="preview-canvas-state preview-empty-state">
                <span className="preview-state-kicker">Preview</span>
                <h3>No preview loaded</h3>
                <p>Open a local dev server, choose a detected service, or start with a common localhost URL.</p>

                <div className="preview-quick-links" aria-label="Preview quick links">
                  {PREVIEW_QUICK_URLS.map((url) => (
                    <button key={url} type="button" className="preview-quick-link" onClick={() => onOpenUrl(url)}>
                      {url.replace(/^https?:\/\//, "")}
                    </button>
                  ))}
                </div>

                <div className="preview-local-services">
                  <div className="preview-local-services-header">
                    <span>Local services</span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={localServiceStatus === "scanning"}
                      onClick={() => void scanLocalPreviewServices()}
                    >
                      {localServiceStatus === "scanning" ? "Scanning" : "Scan again"}
                    </button>
                  </div>

                  {localServiceStatus === "scanning" ? (
                    <p>Checking common dev server ports...</p>
                  ) : localPreviewServices.length > 0 ? (
                    <div className="preview-local-service-list">
                      {localPreviewServices.map((service) => (
                        <button
                          key={service.url}
                          type="button"
                          className="preview-local-service"
                          onClick={() => onOpenUrl(service.url)}
                        >
                          <strong>{service.url.replace(/^https?:\/\//, "")}</strong>
                          <span>{service.statusCode}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>
                      {localServiceStatus === "error"
                        ? "Local service detection is unavailable."
                        : "No local dev servers found on common ports."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </section>
  )
}
