import { useEffect, useRef, useState } from "react"
import { ExternalEditorMenuButton } from "../external-editor/ExternalEditorMenuButton"
import { GitQuickMenuButton } from "../git/GitQuickMenuButton"
import { ChevronDownIcon } from "../icons"
import { getSessionWorkflowBadge } from "../session-workflow"
import { SessionWorkflowBadge, ShellTopMenu, SideChatBadge } from "../shared-ui"
import type {
  ComposerMcpOption,
  ComposerSkillOption,
  PermissionRequest,
  SessionSummary
} from "../types"
import { isSideChatSession } from "../workspace"

interface SessionCanvasTopMenuProps {
  activeSession: SessionSummary | null
  gitProjectID: string | null
  gitDirectory: string | null
  mcpOptions: ComposerMcpOption[]
  pendingPermissionRequests: PermissionRequest[]
  selectedMcpServerIDs: string[]
  selectedMcpServerLabel: string
  onMcpServerToggle: (value: string) => void | Promise<void>
  skillOptions: ComposerSkillOption[]
  selectedSkillIDs: string[]
  selectedSkillLabel: string
  onSkillToggle: (value: string) => void
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
        aria-haspopup="dialog"
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
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel"
          role="dialog"
          aria-label="Project MCP server selection"
        >
          {mcpOptions.length > 0 ? (
            mcpOptions.map((option) => {
              const isSelected = selectedMcpServerIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option canvas-top-menu-segmented-option"}
                  onClick={() => void onMcpServerToggle(option.value)}
                  type="button"
                >
                  <span className="composer-menu-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="composer-menu-option-check">{isSelected ? "Enabled" : "Enable"}</span>
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
          className="canvas-top-menu-selector-panel canvas-top-menu-action-selector-panel"
          role="dialog"
          aria-label="Project skill selection"
        >
          {skillOptions.length > 0 ? (
            skillOptions.map((option) => {
              const isSelected = selectedSkillIDs.includes(option.value)

              return (
                <button
                  key={option.value}
                  className={isSelected ? "composer-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option canvas-top-menu-segmented-option"}
                  onClick={() => onSkillToggle(option.value)}
                  type="button"
                >
                  <span className="composer-menu-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="composer-menu-option-check">{isSelected ? "Selected" : "Add"}</span>
                </button>
              )
            })
          ) : (
            <p className="composer-menu-empty">No project skills are available yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function SessionCanvasTopMenu({
  activeSession,
  gitProjectID,
  gitDirectory,
  mcpOptions,
  pendingPermissionRequests,
  selectedMcpServerIDs,
  selectedMcpServerLabel,
  onMcpServerToggle,
  skillOptions,
  selectedSkillIDs,
  selectedSkillLabel,
  onSkillToggle,
}: SessionCanvasTopMenuProps) {
  const workflowBadge = getSessionWorkflowBadge(activeSession?.workflow, pendingPermissionRequests)
  const readOnlySideChat = isSideChatSession(activeSession)
  const sessionTitle = activeSession?.title ?? ""

  return (
    <ShellTopMenu
      ariaLabel="Session canvas top menu"
      as="div"
      className="session-canvas-top-menu"
      contentClassName="panel-toolbar-copy session-canvas-top-menu-copy"
      content={sessionTitle || readOnlySideChat || workflowBadge ? (
        <div className="session-canvas-top-menu-copy-main">
          {sessionTitle ? <span className="label" title={sessionTitle}>{sessionTitle}</span> : null}
          {readOnlySideChat || workflowBadge ? (
            <div className="session-canvas-top-menu-copy-status">
              {readOnlySideChat ? <SideChatBadge /> : null}
              <SessionWorkflowBadge workflow={workflowBadge} />
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
              <GitQuickMenuButton projectID={gitProjectID} directory={gitDirectory} />
            </>
          ) : null}
        </>
      )}
      trailingClassName="session-canvas-top-menu-actions"
    />
  )
}
