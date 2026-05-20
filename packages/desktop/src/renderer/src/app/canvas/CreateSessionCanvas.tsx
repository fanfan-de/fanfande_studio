import { type ChangeEvent, type PointerEvent, useEffect, useRef, useState } from "react"
import { ThreadMarkdown } from "../thread-markdown"
import type { WorkspaceGroup } from "../types"

interface SkillMetadataField {
  key: string
  value: string | string[]
}

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

function stripYamlValueQuotes(value: string) {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed

  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function parseSkillMetadata(rawMetadata: string) {
  const metadata: SkillMetadataField[] = []
  let currentField: SkillMetadataField | null = null
  let isCollectingBlockScalar = false

  for (const line of rawMetadata.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue

    const fieldMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (fieldMatch) {
      const value = stripYamlValueQuotes(fieldMatch[2])
      currentField = {
        key: fieldMatch[1],
        value: value === ">" || value === "|" ? "" : value,
      }
      isCollectingBlockScalar = value === ">" || value === "|"
      metadata.push(currentField)
      continue
    }

    const listItemMatch = /^\s*-\s+(.+)$/.exec(line)
    if (listItemMatch && currentField) {
      const nextValue = stripYamlValueQuotes(listItemMatch[1])
      currentField.value = Array.isArray(currentField.value)
        ? [...currentField.value, nextValue]
        : currentField.value
          ? [currentField.value, nextValue]
          : [nextValue]
      isCollectingBlockScalar = false
      continue
    }

    const continuationMatch = /^\s+(.+)$/.exec(line)
    if (continuationMatch && currentField && typeof currentField.value === "string") {
      const separator = isCollectingBlockScalar ? "\n" : " "
      currentField.value = currentField.value
        ? `${currentField.value}${separator}${continuationMatch[1].trim()}`
        : continuationMatch[1].trim()
    }
  }

  return metadata.filter((field) => Array.isArray(field.value) ? field.value.length > 0 : field.value.trim().length > 0)
}

function parseSkillMarkdownPreview(markdown: string) {
  const content = markdown.startsWith("\ufeff") ? markdown.slice(1) : markdown
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content)

  if (!match) {
    return {
      body: markdown,
      metadata: [] as SkillMetadataField[],
    }
  }

  return {
    body: content.slice(match[0].length),
    metadata: parseSkillMetadata(match[1]),
  }
}

function getSkillMetadataValue(metadata: SkillMetadataField[], key: string) {
  const field = metadata.find((item) => item.key.toLowerCase() === key)
  if (!field) return null

  if (Array.isArray(field.value)) {
    return field.value.join(", ")
  }

  return field.value
}

function getSkillMetadataList(metadata: SkillMetadataField[], key: string) {
  const field = metadata.find((item) => item.key.toLowerCase() === key)
  if (!field) return []

  if (Array.isArray(field.value)) {
    return field.value
  }

  return field.value.split(",").map((item) => item.trim()).filter(Boolean)
}

function isTruthyMetadataValue(value: string | null) {
  return value ? ["1", "true", "yes"].includes(value.trim().toLowerCase()) : false
}

function SkillMetadataPanel({ metadata }: { metadata: SkillMetadataField[] }) {
  if (metadata.length === 0) return null

  const name = getSkillMetadataValue(metadata, "name")
  const description = getSkillMetadataValue(metadata, "description")
  const allowedTools = getSkillMetadataList(metadata, "allowed-tools")
  const hidden = isTruthyMetadataValue(getSkillMetadataValue(metadata, "hidden"))
  const reservedKeys = new Set(["name", "description", "allowed-tools", "hidden"])
  const extraMetadata = metadata.filter((field) => !reservedKeys.has(field.key.toLowerCase()))

  return (
    <section className="global-skills-metadata-panel" aria-label="Skill metadata">
      <div className="global-skills-metadata-summary">
        <div className="global-skills-metadata-copy">
          <span className="label">Skill Metadata</span>
          {name ? <strong>{name}</strong> : null}
          {description ? <p title={description}>{description}</p> : null}
        </div>
        {hidden ? <span className="global-skills-metadata-badge">Hidden</span> : null}
      </div>

      {allowedTools.length > 0 ? (
        <div className="global-skills-metadata-tools" aria-label="Allowed tools">
          <span>Tools</span>
          <div>
            {allowedTools.map((tool) => (
              <code key={tool}>{tool}</code>
            ))}
          </div>
        </div>
      ) : null}

      {extraMetadata.length > 0 ? (
        <details className="global-skills-metadata-details">
          <summary>More metadata</summary>
          <dl>
            {extraMetadata.map((field) => (
              <div key={field.key}>
                <dt>{field.key}</dt>
                <dd>{Array.isArray(field.value) ? field.value.join(", ") : field.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  )
}

function SkillMarkdownPreview({ text }: { text: string }) {
  const { body, metadata } = parseSkillMarkdownPreview(text)

  return (
    <div className="global-skills-markdown-preview">
      <SkillMetadataPanel metadata={metadata} />
      <ThreadMarkdown
        className="thread-markdown global-skills-markdown-body"
        text={body}
      />
    </div>
  )
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

  const editorShellClassName = viewMode === "preview"
    ? "global-skills-editor-shell is-preview"
    : "global-skills-editor-shell"

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

      <div className={editorShellClassName} onPointerDown={handleEditorShellPointerDown}>
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
          <SkillMarkdownPreview text={selectedFileContent} />
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
  return <span className="create-session-logo" role="img" aria-label="Anybox logo" />
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
