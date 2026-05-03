import { type ChangeEvent, type PointerEvent, useEffect, useRef, useState } from "react"
import { ThreadMarkdown } from "../thread-markdown"
import type { WorkspaceGroup } from "../types"

interface GlobalSkillsCanvasProps {
  deletingGlobalSkillDirectory: string | null
  globalSkillsMessage: {
    tone: "success" | "error"
    text: string
  } | null
  globalSkillsRoot: string
  isDirty: boolean
  isLoadingFile: boolean
  isSavingFile: boolean
  selectedFileContent: string
  selectedFilePath: string | null
  selectedSkillDirectoryName: string | null
  onChange: (value: string) => void
  onDelete: () => void | Promise<void>
  onSave: () => void | Promise<void>
}

export function GlobalSkillsCanvas({
  deletingGlobalSkillDirectory,
  globalSkillsMessage,
  globalSkillsRoot,
  isDirty,
  isLoadingFile,
  isSavingFile,
  selectedFileContent,
  selectedFilePath,
  selectedSkillDirectoryName,
  onChange,
  onDelete,
  onSave,
}: GlobalSkillsCanvasProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit")
  const editorRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!selectedFilePath || isLoadingFile || viewMode !== "edit") return
    editorRef.current?.focus({ preventScroll: true })
  }, [isLoadingFile, selectedFilePath, viewMode])

  function handleEditorShellPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || isLoadingFile || viewMode !== "edit") return
    editorRef.current?.focus({ preventScroll: true })
  }

  if (!selectedFilePath) {
    return (
      <section className="global-skills-canvas">
        <div className="global-skills-editor-shell">
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Skills</span>
            <h3>No skill file selected</h3>
            <p>{globalSkillsRoot ? "Select a skill file or create a new skill." : "Loading the skills folder..."}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="global-skills-canvas">
      <div className="global-skills-toolbar">
        {globalSkillsMessage ? (
          <div
            className={
              globalSkillsMessage.tone === "success"
                ? "settings-banner is-success global-skills-toolbar-message"
                : "settings-banner is-error global-skills-toolbar-message"
            }
          >
            {globalSkillsMessage.text}
          </div>
        ) : (
          <div className="global-skills-toolbar-spacer" aria-hidden="true" />
        )}
        <div className="global-skills-toolbar-actions">
          <div className="global-skills-mode-toggle" role="group" aria-label="Skill markdown view mode">
            <button
              className={viewMode === "edit" ? "global-skills-mode-button is-active" : "global-skills-mode-button"}
              aria-pressed={viewMode === "edit"}
              type="button"
              onClick={() => setViewMode("edit")}
            >
              Edit
            </button>
            <button
              className={viewMode === "preview" ? "global-skills-mode-button is-active" : "global-skills-mode-button"}
              aria-pressed={viewMode === "preview"}
              type="button"
              onClick={() => setViewMode("preview")}
            >
              Preview
            </button>
          </div>
          <button className="secondary-button" disabled={!selectedSkillDirectoryName || deletingGlobalSkillDirectory !== null} type="button" onClick={() => void onDelete()}>
            {deletingGlobalSkillDirectory ? "Deleting..." : "Delete"}
          </button>
          <button className="primary-button" disabled={!isDirty || isSavingFile} type="button" onClick={() => void onSave()}>
            {isSavingFile ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="global-skills-editor-shell" onPointerDown={handleEditorShellPointerDown}>
        {isLoadingFile ? (
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Loading</span>
            <h3>Opening skill file</h3>
            <p>Reading the current file from the global skills directory.</p>
          </div>
        ) : viewMode === "edit" ? (
          <textarea
            ref={editorRef}
            aria-label="Global skill editor"
            className="global-skills-editor"
            spellCheck={false}
            value={selectedFileContent}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <ThreadMarkdown
            className="thread-markdown global-skills-markdown-preview"
            text={selectedFileContent}
          />
        )}
      </div>
    </section>
  )
}

interface CreateSessionCanvasProps {
  isCreatingSession: boolean
  selectedWorkspaceID: string | null
  workspaces: WorkspaceGroup[]
  onWorkspaceChange: (workspaceID: string) => void
}

function CreateSessionLogo() {
  return <span className="create-session-logo" role="img" aria-label="Fanfande Studio logo" />
}

export function CreateSessionCanvas({
  isCreatingSession,
  selectedWorkspaceID,
  workspaces,
  onWorkspaceChange,
}: CreateSessionCanvasProps) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceID) ?? null

  if (workspaces.length === 0) {
    return (
      <section className="thread-shell create-session-shell">
        <article className="create-session-card">
          <CreateSessionLogo />
          <select className="create-session-native-select" aria-label="Session project" disabled value="">
            <option value="">No project available</option>
          </select>
        </article>
      </section>
    )
  }

  return (
    <section className="thread-shell create-session-shell">
      <article className="create-session-card">
        <CreateSessionLogo />
        <select
          className="create-session-native-select"
          aria-label="Session project"
          disabled={isCreatingSession}
          value={selectedWorkspaceID ?? selectedWorkspace?.id ?? ""}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onWorkspaceChange(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.project.name} / {workspace.name}
            </option>
          ))}
        </select>
      </article>
    </section>
  )
}
