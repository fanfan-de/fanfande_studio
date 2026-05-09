import { useEffect, useRef, type PointerEvent, type DragEvent as ReactDragEvent, type ReactNode } from "react"
import { CloseIcon } from "../icons"
import { SideChatBadge } from "../shared-ui"
import type { SessionSummary } from "../types"

interface PaneTabBarProps {
  activeTabKey: string | null
  draggedTabKey: string | null
  hasMergePreview: boolean
  isFocused: boolean
  isTopRow: boolean
  leadingAccessory?: ReactNode
  tabs: Array<
    | {
        key: string
        kind: "session"
        sessionID: string
        sessionKind?: SessionSummary["kind"]
        title: string
        workflow?: SessionSummary["workflow"]
      }
    | {
        key: string
        kind: "create-session"
        createSessionTabID: string
        title: string
      }
  >
  onCloseCreateSessionTab: (createSessionTabID: string) => void
  onCloseSessionTab: (sessionID: string) => void
  onFocus: () => void
  onOpenCreateSessionTab: () => void
  onSelectCreateSessionTab: (createSessionTabID: string) => void
  onSelectSessionTab: (sessionID: string) => void
  onTabDragEnd: () => void
  onTabDragStart: (tabKey: string) => void
  onTabPointerDragMove: (clientX: number, clientY: number) => void
  onTabPointerDrop: (clientX: number, clientY: number) => void
  trailingAccessory?: ReactNode
}

type PaneTabBarTab = PaneTabBarProps["tabs"][number]
type CreateSessionPaneTab = Extract<PaneTabBarTab, { kind: "create-session" }>

const ACTIVE_TAB_CURVE_FILL_PATH = "M16 0L16 16L0 16C8.84 16 16 8.84 16 0Z"
const ACTIVE_TAB_CURVE_STROKE_PATH = "M0 16C8.84 16 16 8.84 16 0"

function PaneTabActiveCurve({ side }: { side: "start" | "end" }) {
  return (
    <span
      className={
        side === "start"
          ? "session-tab-active-curve session-tab-active-curve-start"
          : "session-tab-active-curve session-tab-active-curve-end"
      }
      aria-hidden="true"
    >
      <svg className="session-tab-active-curve-svg" viewBox="0 0 16 16" focusable="false">
        <path className="session-tab-active-curve-fill" d={ACTIVE_TAB_CURVE_FILL_PATH} />
        <path className="session-tab-active-curve-stroke" d={ACTIVE_TAB_CURVE_STROKE_PATH} />
      </svg>
    </span>
  )
}

export function PaneTabBar({
  activeTabKey,
  draggedTabKey,
  hasMergePreview,
  isFocused,
  isTopRow,
  leadingAccessory,
  tabs,
  onCloseCreateSessionTab,
  onCloseSessionTab,
  onFocus,
  onOpenCreateSessionTab,
  onSelectCreateSessionTab,
  onSelectSessionTab,
  onTabDragEnd,
  onTabDragStart,
  onTabPointerDragMove,
  onTabPointerDrop,
  trailingAccessory,
}: PaneTabBarProps) {
  const pointerDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    started: boolean
    tabKey: string
  } | null>(null)
  const suppressClickTabKeyRef = useRef<string | null>(null)
  const activeCreateSessionTab =
    activeTabKey === null
      ? null
      : (tabs.find(
          (tab): tab is CreateSessionPaneTab => tab.key === activeTabKey && tab.kind === "create-session",
        ) ?? null)
  const existingCreateSessionTab =
    activeCreateSessionTab ??
    ([...tabs].reverse().find((tab): tab is CreateSessionPaneTab => tab.kind === "create-session") ?? null)

  function handleTabDragStart(event: ReactDragEvent<HTMLElement>, tabKey: string) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(".session-tab-close")) {
      event.preventDefault()
      return
    }

    try {
      event.dataTransfer?.setData("text/plain", tabKey)
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move"
      }
    } catch {
      // JSDOM and some browser paths can throw when dataTransfer is absent.
    }
    onFocus()
    onTabDragStart(tabKey)
  }

  function handleTabPointerDown(event: PointerEvent<HTMLElement>, tabKey: string) {
    if (event.button !== 0) return

    const target = event.target
    if (target instanceof HTMLElement && target.closest(".session-tab-close")) {
      return
    }

    pointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      tabKey,
    }

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const state = pointerDragRef.current
      if (!state || moveEvent.pointerId !== state.pointerId) return

      if (!state.started) {
        const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY)
        if (distance < 4) return

        state.started = true
        pointerDragRef.current = state
        onFocus()
        onTabDragStart(state.tabKey)
      }

      onTabPointerDragMove(moveEvent.clientX, moveEvent.clientY)
      moveEvent.preventDefault()
    }

    const stopPointerDrag = (nextEvent: globalThis.PointerEvent, shouldDrop: boolean) => {
      const state = pointerDragRef.current
      if (!state || nextEvent.pointerId !== state.pointerId) return

      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      pointerDragRef.current = null

      if (!state.started) return

      suppressClickTabKeyRef.current = state.tabKey
      if (shouldDrop) {
        onTabPointerDrop(nextEvent.clientX, nextEvent.clientY)
        return
      }

      onTabDragEnd()
    }

    const handlePointerUp = (upEvent: globalThis.PointerEvent) => {
      stopPointerDrag(upEvent, true)
    }

    const handlePointerCancel = (cancelEvent: globalThis.PointerEvent) => {
      stopPointerDrag(cancelEvent, false)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
  }

  useEffect(() => {
    return () => {
      pointerDragRef.current = null
    }
  }, [])

  function handleAddCreateSessionTab() {
    onFocus()
    if (existingCreateSessionTab) {
      onSelectCreateSessionTab(existingCreateSessionTab.createSessionTabID)
      return
    }
    onOpenCreateSessionTab()
  }

  const className = [
    "pane-tab-bar",
    "panel-toolbar",
    isFocused ? "is-focused" : null,
    isTopRow && draggedTabKey === null ? "window-drag-region" : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <nav
      className={className}
      aria-label="Pane tabs"
      onPointerDown={() => onFocus()}
    >
      {leadingAccessory ? <div className="pane-tab-bar-leading">{leadingAccessory}</div> : null}
      <div className="pane-tab-bar-tabs" aria-label="Pane tab list">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTabKey
          const createTabIndex =
            tab.kind === "create-session"
              ? tabs.slice(0, tabs.indexOf(tab) + 1).filter((item) => item.kind === "create-session").length - 1
              : -1
          const tabClassName = tab.kind === "create-session"
            ? isActive
              ? "session-tab is-active is-create-tab"
              : "session-tab is-create-tab"
            : isActive
              ? "session-tab is-active"
              : "session-tab"
          const switchLabel =
            tab.kind === "session"
              ? `Switch to session ${tab.title}`
              : createTabIndex === 0
                ? "Switch to create session tab"
                : `Switch to create session tab ${createTabIndex + 1}`
          const closeLabel =
            tab.kind === "session"
              ? `Close session tab ${tab.title}`
              : createTabIndex === 0
                ? "Close create session tab"
                : `Close create session tab ${createTabIndex + 1}`

          if (tab.kind === "session" && tab.sessionKind === "side-chat") {
            return null
          }

          return (
            <div
              key={tab.key}
              className={draggedTabKey === tab.key ? `${tabClassName} is-dragging` : tabClassName}
              onDragEnd={onTabDragEnd}
              onDragStart={(event) => handleTabDragStart(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
            >
              {isActive ? (
                <>
                  <PaneTabActiveCurve side="start" />
                  <PaneTabActiveCurve side="end" />
                </>
              ) : null}
              <button
                className="session-tab-trigger"
                aria-label={switchLabel}
                aria-pressed={isActive}
                title={switchLabel}
                type="button"
                onDragEnd={onTabDragEnd}
                onDragStart={(event) => handleTabDragStart(event, tab.key)}
                onClick={() => {
                  if (suppressClickTabKeyRef.current === tab.key) {
                    suppressClickTabKeyRef.current = null
                    return
                  }
                  onFocus()
                  if (tab.kind === "session") {
                    onSelectSessionTab(tab.sessionID)
                    return
                  }
                  onSelectCreateSessionTab(tab.createSessionTabID)
                }}
              >
                <span className="session-tab-copy">
                  <span className="session-tab-title">{tab.title}</span>
                  {tab.kind === "session" && tab.sessionKind === "side-chat" ? <SideChatBadge compact /> : null}
                </span>
              </button>
              <button
                className="session-tab-close"
                aria-label={closeLabel}
                draggable={false}
                title={closeLabel}
                type="button"
                onDragStart={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={() => {
                  onFocus()
                  if (tab.kind === "session") {
                    onCloseSessionTab(tab.sessionID)
                    return
                  }
                  onCloseCreateSessionTab(tab.createSessionTabID)
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
        {hasMergePreview ? <span className="pane-tab-merge-preview" aria-hidden="true" /> : null}
        <button className="canvas-region-top-menu-add-button" aria-label="Add session tab" title="Add session tab" type="button" onClick={handleAddCreateSessionTab}>
          <span className="canvas-region-top-menu-add-glyph" aria-hidden="true">
            +
          </span>
        </button>
      </div>
      <div className="pane-tab-bar-actions">
        {trailingAccessory ? <div className="pane-tab-bar-trailing">{trailingAccessory}</div> : null}
      </div>
    </nav>
  )
}
