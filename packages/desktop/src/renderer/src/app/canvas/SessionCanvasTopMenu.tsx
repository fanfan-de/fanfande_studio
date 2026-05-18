import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalEditorMenuButton } from "../external-editor/ExternalEditorMenuButton"
import { GitQuickMenuButton } from "../git/GitQuickMenuButton"
import { ChevronDownIcon } from "../icons"
import { ShellTopMenu, SideChatBadge } from "../shared-ui"
import type {
  ComposerMcpOption,
  ComposerPluginOption,
  ComposerSkillOption,
  PermissionRequest,
  SessionSummary,
  ToolPermissionMode,
} from "../types"
import { isSideChatSession } from "../workspace"

const TOOL_PERMISSION_MODE_OPTIONS: Array<{
  value: ToolPermissionMode
  label: string
  description: string
}> = [
  {
    value: "default",
    label: "默认权限",
    description: "ask 进入审批，allow 直接执行，deny 拒绝。",
  },
  {
    value: "full_access",
    label: "完全访问权限",
    description: "ask 自动通过，deny 仍然拒绝。",
  },
]

function getToolPermissionModeLabel(mode: ToolPermissionMode) {
  return TOOL_PERMISSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "默认权限"
}

interface SessionCanvasTopMenuProps {
  activeSession: SessionSummary | null
  gitProjectID: string | null
  gitDirectory: string | null
  showGitControls?: boolean
  isSavingToolPermissionMode: boolean
  mcpOptions: ComposerMcpOption[]
  pluginOptions: ComposerPluginOption[]
  pendingPermissionRequests: PermissionRequest[]
  selectedMcpServerIDs: string[]
  selectedMcpServerLabel: string
  onMcpServerToggle: (value: string) => void | Promise<void>
  selectedPluginIDs: string[]
  selectedPluginLabel: string
  onPluginToggle: (value: string) => void | Promise<void>
  toolPermissionMode: ToolPermissionMode
  toolPermissionModeError: string | null
  onToolPermissionModeChange: (mode: ToolPermissionMode) => void | Promise<void>
  skillOptions: ComposerSkillOption[]
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onSkillToggle: (value: string) => void
}

function ToolPermissionModeMenuButton({
  isSaving,
  mode,
  error,
  onModeChange,
}: {
  isSaving: boolean
  mode: ToolPermissionMode
  error: string | null
  onModeChange: (mode: ToolPermissionMode) => void | Promise<void>
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const selectedLabel = getToolPermissionModeLabel(mode)
  const title = error
    ? `工具权限：${selectedLabel}。保存失败：${error}`
    : `工具权限：${selectedLabel}`

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  function handleOptionClick(nextMode: ToolPermissionMode) {
    if (nextMode === mode || isSaving) return
    setIsMenuOpen(false)
    void onModeChange(nextMode)
  }

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-permission-trigger is-active" : "canvas-top-menu-button canvas-top-menu-permission-trigger"}
        aria-controls="canvas-top-menu-permission-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={`工具权限：${selectedLabel}`}
        title={title}
        disabled={isSaving}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-permission-menu"
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel canvas-top-menu-context-panel canvas-top-menu-permission-panel"
          role="menu"
          aria-label="工具权限模式选择"
        >
          {TOOL_PERMISSION_MODE_OPTIONS.map((option) => {
            const isSelected = option.value === mode

            return (
              <button
                key={option.value}
                className={isSelected ? "canvas-top-menu-context-option canvas-top-menu-permission-option is-selected" : "canvas-top-menu-context-option canvas-top-menu-permission-option"}
                disabled={isSaving}
                onClick={() => handleOptionClick(option.value)}
                role="menuitem"
                title={option.description}
                type="button"
              >
                <span className="canvas-top-menu-context-option-label canvas-top-menu-permission-option-label">
                  <strong>{option.label}</strong>
                </span>
                <span className="canvas-top-menu-context-option-status canvas-top-menu-permission-option-status">{isSelected ? "已选择" : "切换"}</span>
              </button>
            )
          })}
          {error ? <p className="canvas-top-menu-quick-status is-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function ProjectMcpMenuButton({
  mcpOptions,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
}: {
  mcpOptions: ComposerMcpOption[]
  selectedMcpServerIDs: string[]
  selectedMcpServerLabel: string
  onMcpServerToggle: (value: string) => void | Promise<void>
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-mcp-trigger is-active" : "canvas-top-menu-button canvas-top-menu-mcp-trigger"}
        aria-controls="canvas-top-menu-mcp-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={`Select project MCP servers: ${selectedMcpServerLabel}`}
        title={`Project MCP servers: ${selectedMcpServerLabel}`}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedMcpServerLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-mcp-menu"
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel canvas-top-menu-context-panel canvas-top-menu-mcp-panel"
          role="menu"
          aria-label="Project MCP server selection"
        >
          {mcpOptions.length > 0 ? (
            mcpOptions.map((option) => {
              const isSelected = selectedMcpServerIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  aria-checked={isSelected}
                  className={isSelected ? "canvas-top-menu-context-option canvas-top-menu-mcp-option is-selected" : "canvas-top-menu-context-option canvas-top-menu-mcp-option"}
                  onClick={() => void onMcpServerToggle(option.value)}
                  role="menuitemcheckbox"
                  title={option.description}
                  type="button"
                >
                  <span className="canvas-top-menu-context-option-label">
                    <strong>{option.label}</strong>
                  </span>
                  <span className="canvas-top-menu-context-option-status">{isSelected ? "Enabled" : "Enable"}</span>
                </button>
              )
            })
          ) : (
            <p className="composer-menu-empty">No global MCP servers are available yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProjectPluginsMenuButton({
  pluginOptions,
  selectedPluginIDs,
  selectedPluginLabel,
  onPluginToggle,
}: {
  pluginOptions: ComposerPluginOption[]
  selectedPluginIDs: string[]
  selectedPluginLabel: string
  onPluginToggle: (value: string) => void | Promise<void>
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-plugin-trigger is-active" : "canvas-top-menu-button canvas-top-menu-plugin-trigger"}
        aria-controls="canvas-top-menu-plugin-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={`Select project plugins: ${selectedPluginLabel}`}
        title={`Project plugins: ${selectedPluginLabel}`}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedPluginLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-plugin-menu"
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel canvas-top-menu-context-panel canvas-top-menu-plugin-panel"
          role="menu"
          aria-label="Project plugin selection"
        >
          {pluginOptions.length > 0 ? (
            pluginOptions.map((option) => {
              const isSelected = selectedPluginIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  aria-checked={isSelected}
                  className={isSelected ? "canvas-top-menu-context-option canvas-top-menu-plugin-option is-selected" : "canvas-top-menu-context-option canvas-top-menu-plugin-option"}
                  onClick={() => void onPluginToggle(option.value)}
                  role="menuitemcheckbox"
                  title={option.description}
                  type="button"
                >
                  <span className="canvas-top-menu-context-option-label">
                    <strong>{option.label}</strong>
                  </span>
                  <span className="canvas-top-menu-context-option-status">{isSelected ? "Enabled" : "Enable"}</span>
                </button>
              )
            })
          ) : (
            <p className="composer-menu-empty">No installed plugins are enabled yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProjectSkillsMenuButton({
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: {
  skillOptions: ComposerSkillOption[]
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onSkillToggle: (value: string) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [skillSearchQuery, setSkillSearchQuery] = useState("")
  const visibleSkillOptions = useMemo(() => {
    const normalizedQuery = skillSearchQuery.trim().toLocaleLowerCase()
    const selectedSkillIDSet = new Set(selectedSkillIDs)
    const matchingOptions = normalizedQuery
      ? skillOptions.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
      : skillOptions
    const selectedOptions = matchingOptions.filter((option) => selectedSkillIDSet.has(option.value))
    const unselectedOptions = matchingOptions.filter((option) => !selectedSkillIDSet.has(option.value))

    return [...selectedOptions, ...unselectedOptions]
  }, [selectedSkillIDs, skillOptions, skillSearchQuery])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  return (
    <div className="canvas-top-menu-selector-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-skill-trigger is-active" : "canvas-top-menu-button canvas-top-menu-skill-trigger"}
        aria-controls="canvas-top-menu-skill-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        aria-label={`Select project skills: ${selectedSkillLabel}`}
        title={`Project skills: ${selectedSkillLabel}`}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <span>{selectedSkillLabel}</span>
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-skill-menu"
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel canvas-top-menu-context-panel canvas-top-menu-searchable-panel canvas-top-menu-skill-selector-panel"
          role="dialog"
          aria-label="Project skill selection"
        >
          <div className="composer-menu-search" role="presentation">
            <input
              aria-label="Search skills"
              autoFocus
              className="composer-menu-search-input"
              onChange={(event) => setSkillSearchQuery(event.currentTarget.value)}
              placeholder="Search skills"
              type="search"
              value={skillSearchQuery}
            />
          </div>
          <div className="composer-menu-options" role="listbox" aria-label="Skill selection" aria-multiselectable="true">
            {visibleSkillOptions.length > 0 ? (
              visibleSkillOptions.map((option) => {
                const isSelected = selectedSkillIDs.includes(option.value)

                return (
                  <button
                    key={option.value}
                    aria-selected={isSelected}
                    className={isSelected ? "canvas-top-menu-context-option canvas-top-menu-skill-option is-selected" : "canvas-top-menu-context-option canvas-top-menu-skill-option"}
                    onClick={() => onSkillToggle(option.value)}
                    role="option"
                    type="button"
                  >
                    <span className="canvas-top-menu-context-option-label">{option.label}</span>
                  </button>
                )
              })
            ) : (
              <p className="composer-menu-empty">{skillOptions.length > 0 ? "No skills match your search." : "No project skills are available yet."}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SessionCanvasTopMenu({
  activeSession,
  gitProjectID,
  gitDirectory,
  showGitControls = true,
  isSavingToolPermissionMode,
  mcpOptions,
  pluginOptions,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
  selectedPluginIDs,
  selectedPluginLabel,
  onPluginToggle,
  toolPermissionMode,
  toolPermissionModeError,
  onToolPermissionModeChange,
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: SessionCanvasTopMenuProps) {
  const readOnlySideChat = isSideChatSession(activeSession)
  const sessionTitle = activeSession?.title ?? ""

  return (
    <ShellTopMenu
      ariaLabel="Session canvas top menu"
      as="div"
      className="session-canvas-top-menu"
      contentClassName="panel-toolbar-copy session-canvas-top-menu-copy"
      content={sessionTitle || readOnlySideChat ? (
        <div className="session-canvas-top-menu-copy-main">
          {sessionTitle ? <span className="label" title={sessionTitle}>{sessionTitle}</span> : null}
          {readOnlySideChat ? (
            <div className="session-canvas-top-menu-copy-status">
              {readOnlySideChat ? <SideChatBadge /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      controlsSpacerVariant="canvas"
      trailing={(
        <>
          <ExternalEditorMenuButton directory={gitDirectory} />
          {!readOnlySideChat ? (
            <>
              <ToolPermissionModeMenuButton
                error={toolPermissionModeError}
                isSaving={isSavingToolPermissionMode}
                mode={toolPermissionMode}
                onModeChange={onToolPermissionModeChange}
              />
              <ProjectPluginsMenuButton
                pluginOptions={pluginOptions}
                selectedPluginIDs={selectedPluginIDs}
                selectedPluginLabel={selectedPluginLabel}
                onPluginToggle={onPluginToggle}
              />
              <ProjectMcpMenuButton
                mcpOptions={mcpOptions}
                selectedMcpServerIDs={selectedMcpServerIDs}
                selectedMcpServerLabel={selectedMcpServerLabel}
                onMcpServerToggle={onMcpServerToggle}
              />
              <ProjectSkillsMenuButton
                skillOptions={skillOptions}
                selectedSkillIDs={selectedSkillIDs}
                selectedSkillLabel={selectedSkillLabel}
                onSkillToggle={onSkillToggle}
              />
              {showGitControls ? <GitQuickMenuButton projectID={gitProjectID} directory={gitDirectory} /> : null}
            </>
          ) : null}
        </>
      )}
      trailingClassName="session-canvas-top-menu-actions"
    />
  )
}
