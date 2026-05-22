import type { MouseEvent, ReactNode, RefObject } from "react"
import type {
  PreviewInteractionAnchor,
  PreviewInteractionCommitInput,
  PreviewInteractionPayload,
  PreviewInteractionPluginID,
  PreviewInteractionRecord,
  ResolvedPreviewTarget,
} from "../../types"

export interface PreviewWebviewElement extends HTMLElement {
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
  send?: (channel: string, payload?: unknown) => void
}

export interface PreviewInteractionFrameRefs {
  iframeRef: RefObject<HTMLIFrameElement | null>
  webviewRef: RefObject<PreviewWebviewElement | null>
}

export interface PreviewInteractionHoverTarget {
  anchor?: PreviewInteractionAnchor
  className: string
  color?: string
  dimensions: string
  documentX?: number
  documentY?: number
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

export interface PreviewInteractionPointerInput {
  clientX: number
  clientY: number
  frameKind: "iframe" | "webview"
  frameRefs: PreviewInteractionFrameRefs
  overlayBounds: DOMRect
}

export interface PreviewInteractionCommitDraft {
  payload: PreviewInteractionPayload
  targetKey: string
}

export interface PreviewInteractionPlugin {
  id: PreviewInteractionPluginID
  label: string
  appliesTo: (target: ResolvedPreviewTarget) => boolean
  buildCommitDraft: (input: {
    frameKind: "iframe" | "webview"
    pendingTarget: PreviewInteractionHoverTarget
    screenshotPath: string | null
    target: ResolvedPreviewTarget
    text: string
  }) => PreviewInteractionCommitDraft
  formatContext: (records: PreviewInteractionRecord[], requestText: string) => string
  formatRecordLabel: (record: PreviewInteractionRecord, recordIndex: number) => string
  formatRecordTitle: (record: PreviewInteractionRecord) => string
  resolvePointerTarget: (input: PreviewInteractionPointerInput) => PreviewInteractionHoverTarget | Promise<PreviewInteractionHoverTarget>
  resolveTargetKey: (target: ResolvedPreviewTarget) => string
  renderHover?: (target: PreviewInteractionHoverTarget) => ReactNode
}

export interface PreviewInteractionHostProps {
  activeInteractionID: PreviewInteractionPluginID | null
  frameKind: "iframe" | "webview"
  frameRefs: PreviewInteractionFrameRefs
  interactions: PreviewInteractionRecord[]
  plugins: PreviewInteractionPlugin[]
  target: ResolvedPreviewTarget
  webviewReady?: boolean
  onActiveInteractionChange: (pluginID: PreviewInteractionPluginID | null) => void
  onCommitInteraction: (input: PreviewInteractionCommitInput) => void
}

export type PreviewInteractionOverlayMouseEvent = MouseEvent<HTMLDivElement>
