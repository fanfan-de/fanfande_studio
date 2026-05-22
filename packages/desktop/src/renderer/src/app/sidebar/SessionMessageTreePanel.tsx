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
  height: number
  id: string
  x: number
  y: number
}

interface MessageTreeGraphEdge {
  fromID: string
  fromSourceY: number
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

interface MessageTreeGraphAnchor {
  messageID: string
  screenX: number
  screenY: number
}

const COLLAPSED_NODE_HEIGHT = 56
const COLLAPSED_NODE_WIDTH = 136
const EXPANDED_RESPONSE_NODE_HEIGHT = 270
const EXPANDED_RESPONSE_NODE_WIDTH = 296
const NODE_VERTICAL_GAP = 36
const MIN_GRAPH_ZOOM = 0.5
const MAX_GRAPH_ZOOM = 1.8
const GRAPH_ZOOM_DELTA_FACTOR = 0.0014

function canExpandMessageTreeNode(node: SessionMessageTree["nodesByID"][string] | undefined) {
  return Boolean(node && node.role === "assistant" && node.content.trim())
}

function getGraphNodeHeight(
  messageTree: SessionMessageTree,
  messageID: string,
  expandedResponseMessageID: string | null,
) {
  return expandedResponseMessageID === messageID && canExpandMessageTreeNode(messageTree.nodesByID[messageID])
    ? EXPANDED_RESPONSE_NODE_HEIGHT
    : COLLAPSED_NODE_HEIGHT
}

function buildGraphLayout(
  messageTree: SessionMessageTree,
  activePathSet: Set<string>,
  expandedResponseMessageID: string | null,
) {
  const nodesByID = new Map<string, MessageTreeGraphNode>()
  const rawEdges: Array<{ fromID: string; toID: string }> = []
  const hasExpandedResponse = Boolean(
    expandedResponseMessageID && canExpandMessageTreeNode(messageTree.nodesByID[expandedResponseMessageID]),
  )
  const columnGap = hasExpandedResponse ? 236 : 156
  const originX = hasExpandedResponse ? 152 : 92
  const originY = 28
  let nextColumn = 0
  let maxDepth = 0
  let maxY = originY + COLLAPSED_NODE_HEIGHT

  function visit(messageID: string, depth: number, y: number, parentID: string | null, visited: Set<string>): number | null {
    if (visited.has(messageID)) return null
    if (!messageTree.nodesByID[messageID]) return null

    maxDepth = Math.max(maxDepth, depth)

    if (parentID) {
      rawEdges.push({ fromID: parentID, toID: messageID })
    }

    const nextVisited = new Set(visited)
    nextVisited.add(messageID)
    const childColumns: number[] = []
    const nodeHeight = getGraphNodeHeight(messageTree, messageID, expandedResponseMessageID)
    maxY = Math.max(maxY, y + nodeHeight)

    for (const childID of messageTree.childIDsByParentID[messageID] ?? []) {
      const childColumn = visit(childID, depth + 1, y + nodeHeight + NODE_VERTICAL_GAP, messageID, nextVisited)
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
      height: nodeHeight,
      id: messageID,
      x: originX + column * columnGap,
      y,
    })

    return column
  }

  for (const rootMessageID of messageTree.rootMessageIDs) {
    visit(rootMessageID, 0, originY, null, new Set())
  }

  const edges: MessageTreeGraphEdge[] = rawEdges.flatMap((edge) => {
    const from = nodesByID.get(edge.fromID)
    const to = nodesByID.get(edge.toID)
    if (!from || !to) return []

    return [{
      fromID: edge.fromID,
      fromSourceY: from.y + (from.height > COLLAPSED_NODE_HEIGHT ? from.height - 18 : 20),
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
    height: hasExpandedResponse
      ? Math.max(160, maxY + 48)
      : Math.max(160, originY + (maxDepth + 1) * (COLLAPSED_NODE_HEIGHT + NODE_VERTICAL_GAP) + 34),
    nodes,
    width: Math.max(
      260,
      originX +
        Math.max(0, nextColumn - 1) * columnGap +
        (hasExpandedResponse ? EXPANDED_RESPONSE_NODE_WIDTH : COLLAPSED_NODE_WIDTH) / 2 +
        40,
    ),
  }
}

function buildEdgePath(edge: MessageTreeGraphEdge) {
  const startX = edge.fromX
  const startY = edge.fromSourceY
  const endX = edge.toX
  const endY = edge.toY - 10
  const middleY = startY + Math.max(18, (endY - startY) * 0.5)

  return `M ${startX} ${startY} L ${startX} ${middleY} L ${endX} ${middleY} L ${endX} ${endY}`
}

function clampGraphZoom(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_GRAPH_ZOOM, Math.max(MIN_GRAPH_ZOOM, value))
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
  const pendingGraphAnchorRef = useRef<MessageTreeGraphAnchor | null>(null)
  const [graphPan, setGraphPan] = useState<MessageTreeGraphPan>({ x: 0, y: 0 })
  const graphPanRef = useRef<MessageTreeGraphPan>(graphPan)
  const [graphZoom, setGraphZoom] = useState(1)
  const graphZoomRef = useRef(graphZoom)
  const [isCanvasPanning, setIsCanvasPanning] = useState(false)
  const [expandedResponseMessageID, setExpandedResponseMessageID] = useState<string | null>(null)
  const markerBaseID = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const markerID = `${markerBaseID}-tree-arrow`
  const activeMarkerID = `${markerBaseID}-tree-arrow-active`
  const activePathKey = messageTree?.activePathMessageIDs.join("\u0000") ?? ""
  const activePathSet = useMemo(() => new Set(messageTree?.activePathMessageIDs ?? []), [activePathKey, messageTree])
  const graphLayout = useMemo(
    () => (messageTree ? buildGraphLayout(messageTree, activePathSet, expandedResponseMessageID) : null),
    [activePathSet, expandedResponseMessageID, messageTree],
  )
  const nodeCount = messageTree ? Object.keys(messageTree.nodesByID).length : 0
  const branchPointCount = messageTree ? countBranchPoints(messageTree) : 0
  const hasRootNodes = Boolean(messageTree?.rootMessageIDs.some((messageID) => messageTree.nodesByID[messageID]))
  const graphLayoutKey = graphLayout
    ? `${messageTree?.sessionID ?? ""}:${graphLayout.width}:${graphLayout.height}:${nodeCount}:${expandedResponseMessageID ?? ""}`
    : ""

  useEffect(() => () => {
    stopCanvasPan()
  }, [])

  useEffect(() => {
    graphPanRef.current = graphPan
  }, [graphPan])

  useEffect(() => {
    graphZoomRef.current = graphZoom
  }, [graphZoom])

  useEffect(() => {
    if (!expandedResponseMessageID) return
    if (canExpandMessageTreeNode(messageTree?.nodesByID[expandedResponseMessageID])) return
    setExpandedResponseMessageID(null)
  }, [expandedResponseMessageID, messageTree])

  useLayoutEffect(() => {
    if (!graphLayout) return

    const canvas = canvasRef.current
    if (!canvas) return
    const canvasElement = canvas
    const layout = graphLayout
    let frameID: number | null = null
    let attempts = 0

    function readCanvasSize() {
      const canvasWidth = canvasElement.clientWidth
      const canvasHeight = canvasElement.clientHeight

      if (canvasWidth <= 0 || canvasHeight <= 0) {
        if (attempts < 12) {
          attempts += 1
          frameID = window.requestAnimationFrame(centerGraph)
        }
        return
      }

      return { canvasHeight, canvasWidth }
    }

    function centerGraph() {
      const canvasSize = readCanvasSize()
      if (!canvasSize) return

      setGraphPanPosition({
        x: Math.max(24, Math.round((canvasSize.canvasWidth - layout.width * graphZoomRef.current) / 2)),
        y: Math.max(24, Math.round((canvasSize.canvasHeight - layout.height * graphZoomRef.current) / 2)),
      })
    }

    if (graphPanLayoutKeyRef.current !== graphLayoutKey) {
      graphPanLayoutKeyRef.current = graphLayoutKey
      const pendingGraphAnchor = pendingGraphAnchorRef.current
      pendingGraphAnchorRef.current = null
      if (pendingGraphAnchor) {
        const anchoredNode = layout.nodes.find((layoutNode) => layoutNode.id === pendingGraphAnchor.messageID)
        graphPanWasUserControlledRef.current = true
        if (anchoredNode) {
          const zoom = graphZoomRef.current
          setGraphPanPosition({
            x: Math.round(pendingGraphAnchor.screenX - anchoredNode.x * zoom),
            y: Math.round(pendingGraphAnchor.screenY - anchoredNode.y * zoom),
          })
        } else {
          centerGraph()
        }
      } else {
        graphPanWasUserControlledRef.current = false
        centerGraph()
      }
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

    function handleCanvasWheel(event: WheelEvent) {
      if (!event.ctrlKey) return

      event.preventDefault()
      event.stopPropagation()
      stopCanvasPan()

      const currentZoom = graphZoomRef.current
      const nextZoom = clampGraphZoom(currentZoom * Math.exp(-event.deltaY * GRAPH_ZOOM_DELTA_FACTOR))
      if (nextZoom === currentZoom) return

      const rect = canvasElement.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const currentPan = graphPanRef.current
      const graphX = (pointerX - currentPan.x) / currentZoom
      const graphY = (pointerY - currentPan.y) / currentZoom
      const nextPan = {
        x: Math.round(pointerX - graphX * nextZoom),
        y: Math.round(pointerY - graphY * nextZoom),
      }

      graphPanWasUserControlledRef.current = true
      setGraphPanPosition(nextPan)
      setGraphZoomValue(nextZoom)
    }

    canvasElement.addEventListener("pointerdown", handleCanvasPointerDown, true)
    canvasElement.addEventListener("pointermove", handleCanvasPointerMove, true)
    canvasElement.addEventListener("pointerup", handleCanvasPointerEnd, true)
    canvasElement.addEventListener("pointercancel", handleCanvasPointerEnd, true)
    canvasElement.addEventListener("contextmenu", handleCanvasContextMenu, true)
    canvasElement.addEventListener("wheel", handleCanvasWheel, { capture: true, passive: false })

    return () => {
      canvasElement.removeEventListener("pointerdown", handleCanvasPointerDown, true)
      canvasElement.removeEventListener("pointermove", handleCanvasPointerMove, true)
      canvasElement.removeEventListener("pointerup", handleCanvasPointerEnd, true)
      canvasElement.removeEventListener("pointercancel", handleCanvasPointerEnd, true)
      canvasElement.removeEventListener("contextmenu", handleCanvasContextMenu, true)
      canvasElement.removeEventListener("wheel", handleCanvasWheel, true)
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

  function setGraphZoomValue(nextZoom: number) {
    graphZoomRef.current = nextZoom
    setGraphZoom(nextZoom)
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

  function preserveGraphNodeScreenPosition(messageID: string) {
    const layoutNode = graphLayout?.nodes.find((node) => node.id === messageID)
    if (!layoutNode) {
      pendingGraphAnchorRef.current = null
      return
    }

    const zoom = graphZoomRef.current
    const pan = graphPanRef.current
    pendingGraphAnchorRef.current = {
      messageID,
      screenX: pan.x + layoutNode.x * zoom,
      screenY: pan.y + layoutNode.y * zoom,
    }
  }

  function toggleExpandedResponse(messageID: string) {
    const shouldExpand = expandedResponseMessageID !== messageID
    preserveGraphNodeScreenPosition(messageID)
    setExpandedResponseMessageID(shouldExpand ? messageID : null)
  }

  function collapseExpandedResponse(messageID: string | null = expandedResponseMessageID) {
    if (messageID) {
      preserveGraphNodeScreenPosition(messageID)
    } else {
      pendingGraphAnchorRef.current = null
    }
    setExpandedResponseMessageID(null)
  }

  return (
    <section
      className="session-message-tree-panel"
      aria-label="Session message tree"
      onDoubleClickCapture={(event) => {
        if (!expandedResponseMessageID) return

        const target = event.target
        const targetNodeElement = target instanceof Element
          ? target.closest<HTMLElement>(".session-message-tree-graph-node")
          : null
        const targetMessageID = targetNodeElement?.dataset.messageTreeNodeId ?? null
        const targetNode = targetMessageID ? messageTree.nodesByID[targetMessageID] : undefined

        event.preventDefault()
        event.stopPropagation()

        if (
          targetMessageID &&
          targetMessageID !== expandedResponseMessageID &&
          canExpandMessageTreeNode(targetNode)
        ) {
          preserveGraphNodeScreenPosition(targetMessageID)
          setExpandedResponseMessageID(targetMessageID)
          return
        }

        collapseExpandedResponse()
      }}
    >
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
            transform: `matrix(${graphZoom}, 0, 0, ${graphZoom}, ${graphPan.x}, ${graphPan.y})`,
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
            const canExpandResponse = canExpandMessageTreeNode(node)
            const isExpandedResponse = expandedResponseMessageID === node.id && canExpandResponse

            return (
              <div
                key={node.id}
                role="treeitem"
                aria-disabled={isActive ? "true" : undefined}
                aria-current={isActive ? "true" : undefined}
                aria-expanded={canExpandResponse ? isExpandedResponse : undefined}
                aria-level={layoutNode.depth + 1}
                className={joinClassNames(
                  "session-message-tree-graph-node session-message-tree-row",
                  `is-${node.role}`,
                  isActivePath && "is-active-path",
                  isActive && "is-active",
                  isExpandedResponse && "is-expanded-response",
                )}
                style={{
                  left: `${layoutNode.x}px`,
                  top: `${layoutNode.y}px`,
                }}
                data-message-tree-node-id={node.id}
                tabIndex={0}
                title={isExpandedResponse ? undefined : node.preview}
                onClick={(event) => {
                  if (event.button !== 0) return
                  if (!isActive) {
                    void onSelectMessage(currentSession.id, node.id)
                  }
                }}
                onDoubleClick={(event) => {
                  if (!canExpandResponse) return
                  event.preventDefault()
                  event.stopPropagation()
                  toggleExpandedResponse(node.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && isExpandedResponse) {
                    event.preventDefault()
                    collapseExpandedResponse(node.id)
                    return
                  }

                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  if (!isActive) {
                    void onSelectMessage(currentSession.id, node.id)
                  }
                }}
              >
                <span className="session-message-tree-dot" aria-hidden="true" />
                {isExpandedResponse ? (
                  <span className="session-message-tree-response-card">
                    <span className="session-message-tree-response-card-header">
                      <span className="session-message-tree-response-card-title">Response</span>
                      <button
                        type="button"
                        className="session-message-tree-response-collapse"
                        aria-label="Collapse response"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          collapseExpandedResponse(node.id)
                        }}
                      >
                        <span aria-hidden="true">{"\u00d7"}</span>
                      </button>
                    </span>
                    <span className="session-message-tree-response-card-body">{node.content}</span>
                  </span>
                ) : (
                  <span className="session-message-tree-node-preview">{node.preview}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
