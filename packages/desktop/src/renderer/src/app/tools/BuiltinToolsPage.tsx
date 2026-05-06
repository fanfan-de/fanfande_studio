import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, ToolsIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type { BuiltinToolSummary } from "../types"

interface BuiltinToolsMessage {
  tone: "success" | "error"
  text: string
}

interface BuiltinToolsPageProps {
  builtinTools: BuiltinToolSummary[]
  builtinToolsError: string | null
  isBuiltinToolSelectionDirty: boolean
  isLoadingBuiltinTools: boolean
  isSavingBuiltinTools: boolean
  message: BuiltinToolsMessage | null
  windowControls?: ReactNode
  onBuiltinToolToggle: (toolID: string, enabled: boolean) => void
  onDismissMessage: () => void
  onResetBuiltinTools: () => boolean | Promise<boolean>
  onSaveBuiltinTools: () => boolean | Promise<boolean>
}

function formatJson(value: unknown) {
  if (value === undefined) return "{}"

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getBuiltinToolKindLabel(tool: BuiltinToolSummary) {
  return getBuiltinToolGroupLabel(tool.capabilities.kind ?? "other")
}

function getBuiltinToolGroupLabel(kind: BuiltinToolSummary["capabilities"]["kind"] | "other") {
  switch (kind) {
    case "exec":
      return "Shell"
    case "write":
      return "Write"
    case "search":
      return "Search"
    case "read":
      return "Read"
    case "workflow":
      return "Workflow"
    case "interaction":
      return "Interaction"
    case "delegation":
      return "Delegation"
    default:
      return "Other"
  }
}

function getBuiltinToolRiskLabel(tool: BuiltinToolSummary) {
  if (tool.capabilities.needsShell || tool.capabilities.kind === "exec") return "Shell access"
  if (tool.capabilities.kind === "delegation") return tool.capabilities.readOnly ? "Delegation status" : "Delegates work"
  if (tool.capabilities.kind === "workflow") return "Workflow control"
  if (tool.capabilities.kind === "interaction") return "User interaction"
  if (tool.capabilities.destructive) return "High risk"
  if (tool.capabilities.readOnly) return "Read-only"
  return "Moderate"
}

function getBuiltinToolRiskBadgeClassName(tool: BuiltinToolSummary) {
  if (
    tool.capabilities.needsShell ||
    tool.capabilities.kind === "exec" ||
    tool.capabilities.destructive ||
    (tool.capabilities.kind === "delegation" && !tool.capabilities.readOnly) ||
    (tool.capabilities.kind === "workflow" && !tool.capabilities.readOnly)
  ) {
    return "tools-badge is-warning"
  }
  if (tool.capabilities.readOnly) {
    return "tools-badge is-highlight"
  }
  return "tools-badge"
}

const builtinToolKindOrder = ["exec", "write", "delegation", "workflow", "interaction", "search", "read", "other"] as const
type BuiltinToolKindKey = (typeof builtinToolKindOrder)[number]

function getBuiltinToolGroupDescription(groupLabel: string) {
  switch (groupLabel) {
    case "Shell":
      return "Shell-facing commands and process controls available to the agent."
    case "Write":
      return "File mutation tools that can change workspace content."
    case "Delegation":
      return "Subagent coordination tools for delegated work and status checks."
    case "Workflow":
      return "Workflow controls that affect task execution and continuation."
    case "Interaction":
      return "User-facing interaction tools that ask for input or confirmation."
    case "Search":
      return "Search and discovery tools used to locate project context."
    case "Read":
      return "Read-only tools used to inspect files, state, and context."
    default:
      return "Built-in tools that do not fit another category."
  }
}

export function BuiltinToolsPage({
  builtinTools,
  builtinToolsError,
  isBuiltinToolSelectionDirty,
  isLoadingBuiltinTools,
  isSavingBuiltinTools,
  message,
  windowControls,
  onBuiltinToolToggle,
  onDismissMessage,
  onResetBuiltinTools,
  onSaveBuiltinTools,
}: BuiltinToolsPageProps) {
  const [activeToolKind, setActiveToolKind] = useState<BuiltinToolKindKey | null>(null)
  const [expandedToolIDs, setExpandedToolIDs] = useState<Set<string>>(() => new Set())
  const enabledBuiltinToolCount = builtinTools.filter((tool) => tool.enabled).length
  const builtinToolGroups = useMemo(
    () =>
      builtinToolKindOrder
        .map((kind) => {
          const items = builtinTools.filter((tool) => (tool.capabilities.kind ?? "other") === kind)
          return {
            kind,
            label: getBuiltinToolGroupLabel(kind),
            items,
            enabledCount: items.filter((tool) => tool.enabled).length,
          }
        })
        .filter((group) => group.items.length > 0),
    [builtinTools],
  )
  const activeToolGroup = builtinToolGroups.find((group) => group.kind === activeToolKind) ?? builtinToolGroups[0] ?? null

  useEffect(() => {
    const firstKind = builtinToolGroups[0]?.kind ?? null
    if (!firstKind) {
      if (activeToolKind !== null) {
        setActiveToolKind(null)
      }
      return
    }

    if (!activeToolKind || !builtinToolGroups.some((group) => group.kind === activeToolKind)) {
      setActiveToolKind(firstKind)
    }
  }, [activeToolKind, builtinToolGroups])

  const toggleExpandedTool = (toolID: string) => {
    setExpandedToolIDs((currentToolIDs) => {
      const nextToolIDs = new Set(currentToolIDs)
      if (nextToolIDs.has(toolID)) {
        nextToolIDs.delete(toolID)
      } else {
        nextToolIDs.add(toolID)
      }
      return nextToolIDs
    })
  }

  return (
    <section className="builtin-tools-page" aria-label="Built-in tools">
      <ShellTopMenu
        as="header"
        ariaLabel="Tools top menu"
        className="canvas-region-top-menu tools-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="tools-top-menu-label">
            <ToolsIcon />
            <span>Tools</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="tools-top-menu-window-controls"
      />

      <div className="tools-page-main">
        {message ? (
          <div className={message.tone === "success" ? "tools-banner is-success" : "tools-banner is-error"}>
            <span className="tools-banner-text">{message.text}</span>
            <button
              className="tools-banner-dismiss"
              type="button"
              aria-label="Dismiss tools message"
              title="Dismiss"
              onClick={onDismissMessage}
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}

        {builtinToolsError ? <div className="tools-banner is-error">{builtinToolsError}</div> : null}

        {isLoadingBuiltinTools ? (
          <article className="tools-empty-state">
            <span className="label">Loading</span>
            <h3>Fetching built-in tools</h3>
            <p>Reading the built-in registry and saved global availability limits.</p>
          </article>
        ) : (
          <section className="tools-layout" aria-label="Built-in tools">
            <div className="tools-category-panel">
              <div className="tools-category-body">
                <div className="tools-category-list" role="list" aria-label="Tool categories">
                  {builtinToolGroups.map((group) => {
                    const isActive = group.kind === activeToolGroup?.kind

                    return (
                      <button
                        key={group.kind}
                        className={isActive ? "tools-category-item is-active" : "tools-category-item"}
                        aria-label={`${group.label} tools, ${group.enabledCount} of ${group.items.length} enabled`}
                        aria-pressed={isActive}
                        type="button"
                        onClick={() => setActiveToolKind(group.kind)}
                      >
                        <div className="tools-category-item-header">
                          <strong>{group.label}</strong>
                          <span className="tools-badge">{group.items.length}</span>
                        </div>
                        <span className="tools-category-item-copy">
                          {group.enabledCount} of {group.items.length} enabled
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="tools-detail-panel">
              {activeToolGroup ? (
                <>
                  <div className="tools-detail-hero">
                    <div>
                      <span className="label">Built-in tools</span>
                      <h3>{activeToolGroup.label}</h3>
                      <p className="tools-page-copy">
                        {getBuiltinToolGroupDescription(activeToolGroup.label)}
                      </p>
                    </div>

                    <div className="tools-detail-statuses">
                      <span className="tools-badge">
                        {activeToolGroup.enabledCount}/{activeToolGroup.items.length} enabled
                      </span>
                      <span className="tools-badge">
                        {enabledBuiltinToolCount}/{builtinTools.length} total enabled
                      </span>
                    </div>
                  </div>

                  <section className="tools-panel tools-detail-section" aria-label={`${activeToolGroup.label} tools`}>
                    <div className="tools-detail-header">
                      <div>
                        <span className="label">Availability</span>
                        <h2>Global tool availability</h2>
                        <p>
                          {enabledBuiltinToolCount} of {builtinTools.length} built-in tools enabled.
                        </p>
                      </div>
                      <div className="tools-detail-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isSavingBuiltinTools}
                          onClick={() => void onResetBuiltinTools()}
                        >
                          {isSavingBuiltinTools ? "Resetting..." : "Reset to default"}
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!isBuiltinToolSelectionDirty || isSavingBuiltinTools}
                          onClick={() => void onSaveBuiltinTools()}
                        >
                          {isSavingBuiltinTools ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </div>

                    <div className="tools-card-list">
                      {activeToolGroup.items.map((tool) => {
                        const isExpanded = expandedToolIDs.has(tool.id)
                        const detailsID = `builtin-tool-details-${tool.id}`

                        return (
                          <article
                            key={tool.id}
                            className={[
                              "tools-toggle-card",
                              "tools-card",
                              "tools-card-accordion",
                              tool.enabled ? "is-active" : "",
                              isExpanded ? "is-expanded" : "",
                            ].filter(Boolean).join(" ")}
                          >
                            <div className="tools-card-row">
                              <button
                                className="tools-card-expander"
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={detailsID}
                                aria-label={`${isExpanded ? "Hide" : "Show"} details for ${tool.title}`}
                                onClick={() => toggleExpandedTool(tool.id)}
                              >
                                <span className="tools-card-expander-icon" aria-hidden="true">
                                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                                </span>
                                <strong className="tools-card-title">{tool.title}</strong>
                                <span className="tools-card-id">{tool.id}</span>
                              </button>
                              <div className="tools-card-row-actions">
                                <span className="tools-card-meta tools-card-meta-inline">
                                  <span className="tools-badge">{getBuiltinToolKindLabel(tool)}</span>
                                  <span className={getBuiltinToolRiskBadgeClassName(tool)}>
                                    {getBuiltinToolRiskLabel(tool)}
                                  </span>
                                  {tool.aliases.length > 0 ? (
                                    <span className="tools-badge">{tool.aliases.length} aliases</span>
                                  ) : null}
                                </span>
                                <button
                                  className="tools-card-toggle-button"
                                  type="button"
                                  aria-pressed={tool.enabled}
                                  aria-label={`${tool.enabled ? "Disable" : "Enable"} ${tool.title}`}
                                  onClick={() => onBuiltinToolToggle(tool.id, !tool.enabled)}
                                >
                                  <span className="tools-toggle-control" aria-hidden="true">
                                    <span className="tools-toggle-thumb" />
                                  </span>
                                </button>
                              </div>
                            </div>

                            {isExpanded ? (
                              <div className="tools-card-details" id={detailsID}>
                                <dl className="tools-card-detail-grid">
                                  <div className="tools-card-detail-item is-description">
                                    <dt>Description</dt>
                                    <dd title={tool.description}>{tool.description}</dd>
                                  </div>
                                  <div className="tools-card-detail-item">
                                    <dt>Tool ID</dt>
                                    <dd>{tool.id}</dd>
                                  </div>
                                  <div className="tools-card-detail-item">
                                    <dt>Concurrency</dt>
                                    <dd>{tool.capabilities.concurrency ?? "default"}</dd>
                                  </div>
                                  <div className="tools-card-detail-item">
                                    <dt>Aliases</dt>
                                    <dd>{tool.aliases.length > 0 ? tool.aliases.join(", ") : "None"}</dd>
                                  </div>
                                </dl>
                                <div className="tools-card-input-schema">
                                  <span className="tools-card-detail-label">Input schema</span>
                                  <pre>{formatJson(tool.inputSchema ?? {})}</pre>
                                </div>
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  </section>
                </>
              ) : (
                <article className="tools-empty-state tools-detail-empty-state">
                  <h3>No built-in tools</h3>
                  <p>The agent registry did not return any built-in tools.</p>
                </article>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
