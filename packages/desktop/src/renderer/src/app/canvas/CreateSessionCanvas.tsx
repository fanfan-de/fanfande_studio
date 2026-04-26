import { type ChangeEvent } from "react"
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
  if (!selectedFilePath) {
    return (
      <section className="global-skills-canvas">
        <div className="global-skills-editor-shell">
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Global Skills</span>
            <h3>No skill file selected</h3>
            <p>{globalSkillsRoot ? `Open a file from ${globalSkillsRoot} or create a new skill from the left sidebar.` : "Loading the global skills root..."}</p>
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
          <button className="secondary-button" disabled={!selectedSkillDirectoryName || deletingGlobalSkillDirectory !== null} type="button" onClick={() => void onDelete()}>
            {deletingGlobalSkillDirectory ? "Deleting..." : "Delete"}
          </button>
          <button className="primary-button" disabled={!isDirty || isSavingFile} type="button" onClick={() => void onSave()}>
            {isSavingFile ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="global-skills-editor-shell">
        {isLoadingFile ? (
          <div className="global-skills-empty-state global-skills-editor-empty-state">
            <span className="label">Loading</span>
            <h3>Opening skill file</h3>
            <p>Reading the current file from the global skills directory.</p>
          </div>
        ) : (
          <textarea
            aria-label="Global skill editor"
            className="global-skills-editor"
            spellCheck={false}
            value={selectedFileContent}
            onChange={(event) => onChange(event.target.value)}
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
          <img className="create-session-logo" src="/create-session-logo.svg" alt="Fanfande Studio logo" />
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
        <img className="create-session-logo" src="/create-session-logo.svg" alt="Fanfande Studio logo" />
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
