import type {
  PreviewInteractionAnchor,
  PreviewInteractionRecord,
  ResolvedPreviewTarget,
  WebCommentInteractionPayload,
} from "../../types"
import { clamp } from "../../utils"
import type {
  PreviewInteractionHoverTarget,
  PreviewInteractionPlugin,
  PreviewInteractionPointerInput,
} from "./types"

type PreviewGuestInspectionResult = {
  anchor?: PreviewInteractionAnchor
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

function readPreviewValue(value: string | null | undefined) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : "Unavailable"
}

function getPreviewHostLabel(value: string) {
  try {
    const url = new URL(value)
    return url.host || value
  } catch {
    const normalized = value.replace(/\\/g, "/").replace(/\/$/, "")
    return normalized.split("/").filter(Boolean).at(-1) || value || "preview"
  }
}

function getTargetPageUrl(target: ResolvedPreviewTarget) {
  if (target.kind === "url") return target.safePreviewUrl ?? target.normalizedInput
  return target.normalizedInput || target.path || target.entry || target.title
}

export function getPreviewInteractionTargetKey(target: ResolvedPreviewTarget) {
  return target.kind === "url"
    ? target.safePreviewUrl ?? target.normalizedInput
    : target.normalizedInput || target.path || target.entry || target.input
}

function isWebCommentPayload(payload: PreviewInteractionRecord["payload"]): payload is WebCommentInteractionPayload {
  return payload.kind === "web-comment"
}

export function isWebCommentInteraction(record: PreviewInteractionRecord): record is PreviewInteractionRecord & {
  payload: WebCommentInteractionPayload
} {
  return record.pluginID === webCommentPlugin.id && isWebCommentPayload(record.payload)
}

function getPointerTooltipPosition(
  overlayBounds: DOMRect,
  clientX: number,
  clientY: number,
): Pick<PreviewInteractionHoverTarget, "tooltipLeft" | "tooltipPlacement" | "tooltipTop"> {
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

function createCoordinateHoverTarget(x: number, y: number): PreviewInteractionHoverTarget {
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
): PreviewInteractionHoverTarget {
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
  fallbackTarget: PreviewInteractionHoverTarget,
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
        rect: guestResult.anchor.type === "element"
          ? guestResult.anchor.rect ?? {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              top: rect.top,
              width: rect.width,
            }
          : undefined,
      }
    : undefined
  const elementLeft = frameBounds.left - overlayBounds.left + rect.left
  const elementTop = frameBounds.top - overlayBounds.top + rect.top
  const label = anchor?.type === "element" ? anchor.label ?? fallbackTarget.label : fallbackTarget.label

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
  } satisfies PreviewInteractionHoverTarget
}

async function resolveWebviewHoverTarget(input: PreviewInteractionPointerInput) {
  const fallbackTarget = createCoordinateHoverTargetFromBounds(input.overlayBounds, input.clientX, input.clientY)
  const webview = input.frameRefs.webviewRef.current
  const frameBounds = webview?.getBoundingClientRect()
  if (!webview?.executeJavaScript || !frameBounds) return fallbackTarget

  const frameWidth = Math.max(frameBounds.width, 1)
  const frameHeight = Math.max(frameBounds.height, 1)
  const frameLocalX = clamp(input.clientX - frameBounds.left, 0, frameWidth)
  const frameLocalY = clamp(input.clientY - frameBounds.top, 0, frameHeight)

  try {
    const guestResult = await webview.executeJavaScript(
      createWebviewInspectionScript(frameLocalX, frameLocalY),
      true,
    )
    return createHoverTargetFromGuestInspection(guestResult, fallbackTarget, input.overlayBounds, frameBounds)
  } catch {
    return fallbackTarget
  }
}

function resolveIframeHoverTarget(input: PreviewInteractionPointerInput): PreviewInteractionHoverTarget {
  const overlayWidth = Math.max(input.overlayBounds.width, 1)
  const overlayHeight = Math.max(input.overlayBounds.height, 1)
  const fallbackTarget = createCoordinateHoverTargetFromBounds(input.overlayBounds, input.clientX, input.clientY)

  try {
    const iframe = input.frameRefs.iframeRef.current
    const frameBounds = iframe?.getBoundingClientRect()
    if (!frameBounds) return fallbackTarget

    const frameWidth = Math.max(frameBounds.width, 1)
    const frameHeight = Math.max(frameBounds.height, 1)
    const frameLocalX = clamp(input.clientX - frameBounds.left, 0, frameWidth)
    const frameLocalY = clamp(input.clientY - frameBounds.top, 0, frameHeight)
    const frameDocument = iframe?.contentDocument
    const element = frameDocument?.elementFromPoint(frameLocalX, frameLocalY)
    if (!isElement(element)) return fallbackTarget

    const elementBounds = element.getBoundingClientRect()
    if (elementBounds.width <= 0 || elementBounds.height <= 0) {
      return fallbackTarget
    }

    const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element)
    const anchor: PreviewInteractionAnchor = {
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
    const elementLeft = frameBounds.left - input.overlayBounds.left + elementBounds.left
    const elementTop = frameBounds.top - input.overlayBounds.top + elementBounds.top

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

function formatNodePosition(payload: WebCommentInteractionPayload) {
  const rect = payload.anchor?.type === "element" ? payload.anchor.rect : null
  const coordinate = `${Math.round(payload.x)}%, ${Math.round(payload.y)}%`
  if (!rect) return coordinate

  return `${coordinate}; target rect ${Math.round(rect.left)}, ${Math.round(rect.top)}, ${Math.round(rect.width)}x${Math.round(rect.height)}`
}

function readAnchorLabel(anchor: PreviewInteractionAnchor | undefined) {
  return anchor?.type === "element"
    ? anchor.label?.trim() || anchor.tagName?.trim() || "Preview target"
    : "Preview target"
}

export const webCommentPlugin: PreviewInteractionPlugin = {
  id: "web.comment",
  label: "Comment",
  appliesTo: (target) => target.renderer === "url-webview" || target.renderer === "html-preview",
  buildCommitDraft: ({ frameKind, pendingTarget, screenshotPath, target, text }) => {
    const payload: WebCommentInteractionPayload = {
      kind: "web-comment",
      anchor: pendingTarget.anchor,
      frame: frameKind,
      nodePosition: formatNodePosition({
        kind: "web-comment",
        anchor: pendingTarget.anchor,
        pageUrl: getTargetPageUrl(target),
        text,
        x: pendingTarget.x,
        y: pendingTarget.y,
      }),
      pageUrl: getTargetPageUrl(target),
      screenshotPath,
      text,
      x: pendingTarget.x,
      y: pendingTarget.y,
    }

    return {
      payload,
      targetKey: getPreviewInteractionTargetKey(target),
    }
  },
  formatContext: (records, requestText) => {
    const webRecords = records.filter(isWebCommentInteraction)
    if (webRecords.length === 0) return ""

    const lines = ["# Diff comments:", ""]
    for (const [index, record] of webRecords.entries()) {
      const payload = record.payload
      const anchor = payload.anchor

      lines.push(
        `## Comment ${index + 1}`,
        `Node position: ${readPreviewValue(payload.nodePosition ?? formatNodePosition(payload))}`,
        `Page URL: ${readPreviewValue(payload.pageUrl)}`,
        `Frame: ${readPreviewValue(payload.frame)}`,
        `Target: ${readPreviewValue(readAnchorLabel(anchor))}`,
        `Target selector: ${readPreviewValue(anchor?.type === "element" ? anchor.selector : null)}`,
        `Target path: ${readPreviewValue(anchor?.type === "element" ? anchor.path : null)}`,
        `Saved marker screenshot: ${readPreviewValue(payload.screenshotPath)}`,
        "Comment:",
        payload.text.trim(),
        "",
      )
    }

    const currentUrl = readPreviewValue(webRecords.at(-1)?.payload.pageUrl)
    lines.push(
      "# In app browser:",
      "- The user has the in-app browser open.",
      `- Current URL: ${currentUrl}`,
      "",
      "## User request:",
      requestText,
    )

    return lines.join("\n").trim()
  },
  formatRecordLabel: (record, recordIndex) => {
    const pageUrl = isWebCommentInteraction(record) ? record.payload.pageUrl : record.targetKey
    return `preview:${getPreviewHostLabel(pageUrl)}#${Math.max(1, recordIndex)}`
  },
  formatRecordTitle: (record) => {
    if (!isWebCommentInteraction(record)) return record.snapshot?.title ?? record.targetKey
    return `${readAnchorLabel(record.payload.anchor)} - ${record.payload.pageUrl}`
  },
  resolvePointerTarget: (input) => {
    if (input.frameKind === "webview") return resolveWebviewHoverTarget(input)
    return resolveIframeHoverTarget(input)
  },
  resolveTargetKey: getPreviewInteractionTargetKey,
}
