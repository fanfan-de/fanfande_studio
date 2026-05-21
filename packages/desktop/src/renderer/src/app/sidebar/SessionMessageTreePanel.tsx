import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { SessionMessageTree } from "../session-message-tree"
import { joinClassNames } from "../shared-ui"
import type { SessionSummary } from "../types"

interface SessionMessageTreePanelProps {
  messageTree: SessionMessageTree | null
  session: SessionSummary | null
  onSelectMessage: (sessionID: string, messageID: string) => void | Promise<void>
}

function countBranchPoints(messageTree: SessionMessageTree) {
  return Object.entries(messageTree.childIDsByParentID).filter(([parentID, childIDs]) => (
    Boolean(messageTree.nodesByID[parentID]) && childIDs.length > 1
  )).length
}

interface MessageTreeGraphNode {
  column: number
  depth: number
  id: string
  x: number
  y: number
}

interface MessageTreeGraphEdge {
  fromID: string
  fromX: number
  fromY: number
  isActivePath: boolean
  toID: string
  toX: number
  toY: number
}

interface MessageTreeCanvasPanState {
  pointerID: number
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
}

interface MessageTreeGraphPan {
  x: number
  y: number
}

function buildGraphLayout(messageTree: SessionMessageTree, activePathSet: Set<string>) {
  const nodesByID = new Map<string, MessageTreeGraphNode>()
  const rawEdges: Array<{ fromID: string; toID: string }> = []
  const columnGap = 156
  const rowGap = 92
  const originX = 92
  const originY = 28
  let nextColumn = 0
  let maxDepth = 0

  function visit(messageID: string, depth: number, parentID: string | null, visited: Set<string>): number | null {
    if (visited.has(messageID)) return null
    if (!messageTree.nodesByID[messageID]) return null

    maxDepth = Math.max(maxDepth, depth)

    if (parentID) {
      rawEdges.push({ fromID: parentID, toID: messageID })
    }

    const nextVisited = new Set(visited)
    nextVisited.add(messageID)
    const childColumns: number[] = []

    for (const childID of messageTree.childIDsByParentID[messageID] ?? []) {
      const childColumn = visit(childID, depth + 1, messageID, nextVisited)
      if (childColumn !== null) {
        childColumns.push(childColumn)
      }
    }

    const column = childColumns.length > 0
      ? childColumns.reduce((total, value) => total + value, 0) / childColumns.length
      : nextColumn++

    nodesByID.set(messageID, {
      column,
      depth,
      id: messageID,
      x: originX + column * columnGap,
      y: originY + depth * rowGap,
    })

    return column
  }

  for (const rootMessageID of messageTree.rootMessageIDs) {
    visit(rootMessageID, 0, null, new Set())
  }

  const edges: MessageTreeGraphEdge[] = rawEdges.flatMap((edge) => {
    const from = nodesByID.get(edge.fromID)
    const to = nodesByID.get(edge.toID)
    if (!from || !to) return []

    return [{
      fromID: edge.fromID,
      fromX: from.x,
      fromY: from.y,
      isActivePath: activePathSet.has(edge.fromID) && activePathSet.has(edge.toID),
      toID: edge.toID,
      toX: to.x,
      toY: to.y,
    }]
  })

  const nodes = [...nodesByID.values()].sort((left, right) => (
    left.depth === right.depth
      ? left.column - right.column
      : left.depth - right.depth
  ))

  return {
    edges,
    height: Math.max(160, originY + (maxDepth + 1) * rowGap + 34),
    nodes,
    width: Math.max(260, originX + Math.max(0, nextColumn - 1) * columnGap + 108),
  }
}

function buildEdgePath(edge: MessageTreeGraphEdge) {
  const startX = edge.fromX
  const startY = edge.fromY + 20
  const endX = edge.toX
  const endY = edge.toY - 10
  const middleY = startY + Math.max(18, (endY - startY) * 0.5)

  return `M ${startX} ${startY} L ${startX} ${middleY} L ${endX} ${middleY} L ${endX} ${endY}`
}

export function SessionMessageTreePanel({
  messageTree,
  session,
  onSelectMessage,
}: SessionMessageTreePanelProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasPanCleanupRef = useRef<(() => void) | null>(null)
  const canvasPanStateRef = useRef<MessageTreeCanvasPanState | null>(null)
  const graphPanLayoutKeyRef = useRef<string | null>(null)
  const graphPanWasUserControlledRef = useRef(false)
  const [graphPan, setGraphPan] = useState<MessageTreeGraphPan>({ x: 0, y: 0 })
  const graphPanRef = useRef<MessageTreeGraphPan>(graphPan)
  const [isCanvasPanning, setIsCanvasPanning] = useState(false)
  const markerBaseID = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const markerID = `${markerBaseID}-tree-arrow`
  const activeMarkerID = `${markerBaseID}-tree-arrow-active`
  const activePathKey = messageTree?.activePathMessageIDs.join("\u0000") ?? ""
  const activePathSet = useMemo(() => new Set(messageTree?.activePathMessageIDs ?? []), [activePathKey, messageTree])
  const graphLayout = useMemo(
    () => (messageTree ? buildGraphLayout(messageTree, activePathSet) : null),
    [activePathSet, messageTree],
  )
  const nodeCount = messageTree ? Object.keys(messageTree.nodesByID).length : 0
  const branchPointCount = messageTree ? countBranchPoints(messageTree) : 0
  const hasRootNodes = Boolean(messageTree?.rootMessageIDs.some((messageID) => messageTree.nodesByID[messageID]))
  const graphLayoutKey = graphLayout
    ? `${messageTree?.sessionID ?? ""}:${graphLayout.width}:${graphLayout.height}:${nodeCount}`
    : ""

  useEffect(() => () => {
    stopCanvasPan()
  }, [])

  useEffect(() => {
    graphPanRef.current = graphPan
  }, [graphPan])

  useLayoutEffect(() => {
    if (!graphLayout) return

    const canvas = canvasRef.current
    if (!canvas) return
    const canvasElement = canvas
    const layout = graphLayout
    let frameID: number | null = null
    let attempts = 0

    function centerGraph() {
      const canvasWidth = canvasElement.clientWidth
      const canvasHeight = canvasElement.clientHeight

      if (canvasWidth <= 0 || canvasHeight <= 0) {
        if (attempts < 12) {
          attempts += 1
          frameID = window.requestAnimationFrame(centerGraph)
        }
        return
      }

      setGraphPanPosition({
        x: Math.max(24, Math.round((canvasWidth - layout.width) / 2)),
        y: Math.max(24, Math.round((canvasHeight - layout.height) / 2)),
      })
    }

    if (graphPanLayoutKeyRef.current !== graphLayoutKey) {
      graphPanLayoutKeyRef.current = graphLayoutKey
      graphPanWasUserControlledRef.current = false
      centerGraph()
    } else if (!graphPanWasUserControlledRef.current) {
      centerGraph()
    }

    if (graphPanWasUserControlledRef.current) {
      return () => {
        if (frameID !== null) {
          window.cancelAnimationFrame(frameID)
        }
      }
    }

    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (frameID !== null) {
          window.cancelAnimationFrame(frameID)
        }
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!graphPanWasUserControlledRef.current) {
        attempts = 0
        centerGraph()
      }
    })
    resizeObserver.observe(canvasElement)

    return () => {
      if (frameID !== null) {
        window.cancelAnimationFrame(frameID)
      }
      resizeObserver.disconnect()
    }
  }, [graphLayout, graphLayoutKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const canvasElement = canvas

    function handleCanvasPointerDown(event: PointerEvent) {
      if (event.button !== 2) return

      event.preventDefault()
      event.stopPropagation()
      stopCanvasPan()
      canvasPanStateRef.current = {
        pointerID: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: graphPanRef.current.x,
        startPanY: graphPanRef.current.y,
      }
      graphPanWasUserControlledRef.current = true
      setIsCanvasPanning(true)

      try {
        canvasElement.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture can fail in tests or if the pointer was already released.
      }

      function handleWindowPointerMove(windowEvent: PointerEvent) {
        updateCanvasPan(windowEvent)
      }

      function handleWindowPointerUp(windowEvent: PointerEvent) {
        if (windowEvent.pointerId === event.pointerId) {
          windowEvent.preventDefault()
          windowEvent.stopPropagation()
          stopCanvasPan()
        }
      }

      window.addEventListener("pointermove", handleWindowPointerMove, true)
      window.addEventListener("pointerup", handleWindowPointerUp, true)
      window.addEventListener("pointercancel", handleWindowPointerUp, true)
      canvasPanCleanupRef.current = () => {
        window.removeEventListener("pointermove", handleWindowPointerMove, true)
        window.removeEventListener("pointerup", handleWindowPointerUp, true)
        window.removeEventListener("pointercancel", handleWindowPointerUp, true)
        canvasPanCleanupRef.current = null
      }
    }

    function handleCanvasPointerMove(event: PointerEvent) {
      updateCanvasPan(event)
    }

    function handleCanvasPointerEnd(event: PointerEvent) {
      const activePan = canvasPanStateRef.current
      if (!activePan || activePan.pointerID !== event.pointerId) return

      event.preventDefault()
      event.stopPropagation()
      stopCanvasPan()
    }

    function handleCanvasContextMenu(event: MouseEvent) {
      event.preventDefault()
      event.stopPropagation()
    }

    canvasElement.addEventListener("pointerdown", handleCanvasPointerDown, true)
    canvasElement.addEventListener("pointermove", handleCanvasPointerMove, true)
    canvasElement.addEventListener("pointerup", handleCanvasPointerEnd, true)
    canvasElement.addEventListener("pointercancel", handleCanvasPointerEnd, true)
    canvasElement.addEventListener("contextmenu", handleCanvasContextMenu, true)

    return () => {
      canvasElement.removeEventListener("pointerdown", handleCanvasPointerDown, true)
      canvasElement.removeEventListener("pointermove", handleCanvasPointerMove, true)
      canvasElement.removeEventListener("pointerup", handleCanvasPointerEnd, true)
      canvasElement.removeEventListener("pointercancel", handleCanvasPointerEnd, true)
      canvasElement.removeEventListener("contextmenu", handleCanvasContextMenu, true)
    }
  }, [])

  if (!session) {
    return (
      <div className="right-sidebar-empty session-message-tree-empty" role="status">
        <p>No session selected.</p>
      </div>
    )
  }

  if (!messageTree || !hasRootNodes) {
    return (
      <div className="right-sidebar-empty session-message-tree-empty" role="status">
        <p>No message tree loaded yet.</p>
      </div>
    )
  }

  const currentSession = session

  function setGraphPanPosition(nextPan: MessageTreeGraphPan) {
    graphPanRef.current = nextPan
    setGraphPan(nextPan)
  }

  function stopCanvasPan() {
    const activePan = canvasPanStateRef.current
    if (!activePan) return

    const canvas = canvasRef.current
    if (canvas) {
      try {
        canvas.releasePointerCapture(activePan.pointerID)
      } catch {
        // The pointer may already have been released by the browser.
      }
    }
    canvasPanCleanupRef.current?.()
    canvasPanStateRef.current = null
    setIsCanvasPanning(false)
  }

  function updateCanvasPan(event: PointerEvent) {
    const activePan = canvasPanStateRef.current
    if (!activePan || activePan.pointerID !== event.pointerId) return

    if ((event.buttons & 2) === 0) {
      stopCanvasPan()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setGraphPanPosition({
      x: activePan.startPanX + (event.clientX - activePan.startClientX),
      y: activePan.startPanY + (event.clientY - activePan.startClientY),
    })
  }

  return (
    <section className="session-message-tree-panel" aria-label="Session message tree">
      <header className="session-message-tree-header">
        <div className="session-message-tree-title-copy">
          <span>Session tree</span>
          <h3 title={session.title}>{session.title}</h3>
        </div>
        <div className="session-message-tree-meta" aria-label="Tree summary">
          <span>{nodeCount} messages</span>
          <span>{branchPointCount} branch points</span>
        </div>
      </header>

      <div
        ref={canvasRef}
        className={joinClassNames("session-message-tree-canvas", isCanvasPanning && "is-panning")}
      >
        <div
          className="session-message-tree-graph"
          role="tree"
          aria-label={`Message tree for ${currentSession.title}`}
          style={{
            height: graphLayout ? `${graphLayout.height}px` : undefined,
            transform: `translate(${graphPan.x}px, ${graphPan.y}px)`,
            width: graphLayout ? `${graphLayout.width}px` : undefined,
          }}
        >
          {graphLayout ? (
            <svg
              className="session-message-tree-edges"
              width={graphLayout.width}
              height={graphLayout.height}
              viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={markerID}
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="7"
                  refY="4"
                  viewBox="0 0 8 8"
                >
                  <path className="session-message-tree-edge-arrow" d="M0,0 L8,4 L0,8 Z" />
                </marker>
                <marker
                  id={activeMarkerID}
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="7"
                  refY="4"
                  viewBox="0 0 8 8"
                >
                  <path className="session-message-tree-edge-arrow is-active-path" d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              {graphLayout.edges.map((edge) => (
                <path
                  key={`${edge.fromID}-${edge.toID}`}
                  className={joinClassNames(
                    "session-message-tree-edge",
                    edge.isActivePath && "is-active-path",
                  )}
                  d={buildEdgePath(edge)}
                  markerEnd={`url(#${edge.isActivePath ? activeMarkerID : markerID})`}
                />
              ))}
            </svg>
          ) : null}

          {graphLayout?.nodes.map((layoutNode) => {
            const node = messageTree.nodesByID[layoutNode.id]
            if (!node) return null

            const isActive = node.id === messageTree.activeMessageID
            const isActivePath = activePathSet.has(node.id)

            return (
              <button
                key={node.id}
                type="button"
                role="treeitem"
                aria-disabled={isActive ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                aria-level={layoutNode.depth + 1}
                className={joinClassNames(
                  "session-message-tree-graph-node session-message-tree-row",
                  `is-${node.role}`,
                  isActivePath && "is-active-path",
                  isActive && "is-active",
                )}
                style={{
                  left: `${layoutNode.x}px`,
                  top: `${layoutNode.y}px`,
                }}
                title={node.preview}
                onClick={(event) => {
                  if (event.button !== 0) return
                  if (!isActive) {
                    void onSelectMessage(currentSession.id, node.id)
                  }
                }}
              >
                <span className="session-message-tree-dot" aria-hidden="true" />
                <span className="session-message-tree-node-preview">{node.preview}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
