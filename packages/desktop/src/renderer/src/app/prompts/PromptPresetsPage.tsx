import { type ChangeEvent, type ReactNode, useState } from "react"
import { CloseIcon, FileTextIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import { ThreadMarkdown } from "../thread-markdown"
import type {
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
} from "../types"

type PromptEditorMode = "edit" | "preview"

interface PromptEditorMessage {
  tone: "success" | "error"
  text: string
}

interface PromptPresetsPageProps {
  deletingPromptPresetID: string | null
  isCreatingPromptPreset: boolean
  isLoadingPromptPreset: boolean
  isLoadingPrompts: boolean
  isPlanModePromptPresetDirty: boolean
  isPromptDirty: boolean
  isSavingPromptPresetSelection: boolean
  isSideChatPromptPresetDirty: boolean
  isSystemPromptPresetDirty: boolean
  message: PromptEditorMessage | null
  promptDraftContent: string
  promptDraftLabel: string
  promptLoadError: string | null
  promptPresets: PromptPresetSummary[]
  promptPresetSelection: PromptPresetSelection | null
  resettingPromptPresetID: string | null
  savingPromptPresetID: string | null
  savingPromptPresetSelectionField: keyof PromptPresetSelection | null
  selectedPromptPreset: PromptPresetDocument | null
  windowControls?: ReactNode
  onCreatePromptPreset: () => boolean | Promise<boolean>
  onDeletePromptPreset: () => boolean | Promise<boolean>
  onDismissMessage: () => void
  onPromptDraftChange: (value: string) => void
  onPromptDraftLabelChange: (value: string) => void
  onPromptPresetSelect: (presetID: string) => boolean | Promise<boolean>
  onPromptPresetSelectionChange: (field: keyof PromptPresetSelection, value: string) => void
  onResetPromptPreset: () => boolean | Promise<boolean>
  onSavePromptPreset: () => boolean | Promise<boolean>
  onSavePromptPresetSelection: (field?: keyof PromptPresetSelection) => boolean | Promise<boolean>
}

function getPromptPresetSourceLabel(source: PromptPresetSummary["source"]) {
  return source === "custom" ? "Custom" : "Bundled"
}

function getPromptPresetUsageLabels(
  presetID: string,
  selection: PromptPresetSelection | null,
) {
  if (!selection) return []

  const labels: string[] = []
  if (selection.systemPromptPresetID === presetID) {
    labels.push("System")
  }
  if (selection.planModePromptPresetID === presetID) {
    labels.push("Plan")
  }
  if (selection.sideChatPromptPresetID === presetID) {
    labels.push("Side chat")
  }

  return labels
}

function getPromptMarkdownPreviewText(value: string) {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function PromptPresetsPage({
  deletingPromptPresetID,
  isCreatingPromptPreset,
  isLoadingPromptPreset,
  isLoadingPrompts,
  isPlanModePromptPresetDirty,
  isPromptDirty,
  isSavingPromptPresetSelection,
  isSideChatPromptPresetDirty,
  isSystemPromptPresetDirty,
  message,
  promptDraftContent,
  promptDraftLabel,
  promptLoadError,
  promptPresets,
  promptPresetSelection,
  resettingPromptPresetID,
  savingPromptPresetID,
  savingPromptPresetSelectionField,
  selectedPromptPreset,
  windowControls,
  onCreatePromptPreset,
  onDeletePromptPreset,
  onDismissMessage,
  onPromptDraftChange,
  onPromptDraftLabelChange,
  onPromptPresetSelect,
  onPromptPresetSelectionChange,
  onResetPromptPreset,
  onSavePromptPreset,
  onSavePromptPresetSelection,
}: PromptPresetsPageProps) {
  const promptPresetOptions = [...promptPresets].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "bundled" ? -1 : 1
    }

    return left.label.localeCompare(right.label)
  })
  const selectedPromptPresetBusy =
    selectedPromptPreset !== null &&
    (
      savingPromptPresetID === selectedPromptPreset.id ||
      resettingPromptPresetID === selectedPromptPreset.id ||
      deletingPromptPresetID === selectedPromptPreset.id
    )
  const selectedPromptPresetUsageLabels = selectedPromptPreset
    ? getPromptPresetUsageLabels(selectedPromptPreset.id, promptPresetSelection)
    : []
  const [promptEditorMode, setPromptEditorMode] = useState<PromptEditorMode>("edit")

  function handlePromptPresetSelection(presetID: string) {
    if (presetID === selectedPromptPreset?.id) return
    if (
      isPromptDirty &&
      typeof window.confirm === "function" &&
      !window.confirm("Discard unsaved prompt changes and switch presets?")
    ) {
      return
    }

    void onPromptPresetSelect(presetID)
  }

  function handlePromptPresetCreate() {
    if (
      isPromptDirty &&
      typeof window.confirm === "function" &&
      !window.confirm("Discard unsaved prompt changes and create a new preset?")
    ) {
      return
    }

    void onCreatePromptPreset()
  }

  return (
    <section className="prompt-presets-page" aria-label="Prompt presets">
      <ShellTopMenu
        as="header"
        ariaLabel="Prompts top menu"
        className="canvas-region-top-menu prompt-presets-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="prompt-presets-top-menu-label">
            <FileTextIcon />
            <span>Prompts</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div className="settings-page-main is-services prompt-presets-page-main">
        {message ? (
          <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>
            <span className="settings-banner-text">{message.text}</span>
            <button
              className="settings-banner-dismiss"
              type="button"
              aria-label="Dismiss settings message"
              title="Dismiss"
              onClick={onDismissMessage}
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}

        {promptLoadError ? (
          <div className="settings-banner is-error">{promptLoadError}</div>
        ) : null}

        {isLoadingPrompts ? (
          <article className="settings-empty-state">
            <span className="label">Loading</span>
            <h3>Fetching prompt presets</h3>
            <p>Reading the prompt catalog, override state, and current editable content.</p>
          </article>
        ) : (
          <section className="settings-prompts-shell" aria-label="Prompt preset layout">
            <section className="settings-panel settings-prompt-slots-panel">
              <div className="settings-prompt-assignment-list">
                <div className="settings-prompt-assignment-row">
                  <div className="settings-prompt-assignment-copy">
                    <span className="settings-prompt-assignment-title">System</span>
                    <span className="settings-prompt-assignment-note">Every turn</span>
                  </div>

                  <div className="settings-prompt-assignment-control">
                    <div className="settings-prompt-assignment-actions">
                      <select
                        id="settings-system-prompt-preset"
                        aria-label="System prompt preset"
                        value={promptPresetSelection?.systemPromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(event) =>
                          onPromptPresetSelectionChange("systemPromptPresetID", event.target.value)
                        }
                      >
                        {promptPresetOptions.map((preset) => (
                          <option key={`system-${preset.id}`} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Confirm system prompt preset"
                        disabled={!isSystemPromptPresetDirty || isSavingPromptPresetSelection}
                        onClick={() => void onSavePromptPresetSelection("systemPromptPresetID")}
                      >
                        {savingPromptPresetSelectionField === "systemPromptPresetID" ? "Saving..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-prompt-assignment-row">
                  <div className="settings-prompt-assignment-copy">
                    <span className="settings-prompt-assignment-title">Plan</span>
                    <span className="settings-prompt-assignment-note">Plan only</span>
                  </div>

                  <div className="settings-prompt-assignment-control">
                    <div className="settings-prompt-assignment-actions">
                      <select
                        id="settings-plan-mode-prompt-preset"
                        aria-label="Plan mode prompt preset"
                        value={promptPresetSelection?.planModePromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(event) =>
                          onPromptPresetSelectionChange("planModePromptPresetID", event.target.value)
                        }
                      >
                        {promptPresetOptions.map((preset) => (
                          <option key={`plan-${preset.id}`} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Confirm plan mode prompt preset"
                        disabled={!isPlanModePromptPresetDirty || isSavingPromptPresetSelection}
                        onClick={() => void onSavePromptPresetSelection("planModePromptPresetID")}
                      >
                        {savingPromptPresetSelectionField === "planModePromptPresetID" ? "Saving..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-prompt-assignment-row">
                  <div className="settings-prompt-assignment-copy">
                    <span className="settings-prompt-assignment-title">Side chat</span>
                    <span className="settings-prompt-assignment-note">Side chat only</span>
                  </div>

                  <div className="settings-prompt-assignment-control">
                    <div className="settings-prompt-assignment-actions">
                      <select
                        id="settings-side-chat-prompt-preset"
                        aria-label="Side chat prompt preset"
                        value={promptPresetSelection?.sideChatPromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(event) =>
                          onPromptPresetSelectionChange("sideChatPromptPresetID", event.target.value)
                        }
                      >
                        {promptPresetOptions.map((preset) => (
                          <option key={`side-chat-${preset.id}`} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Confirm side chat prompt preset"
                        disabled={!isSideChatPromptPresetDirty || isSavingPromptPresetSelection}
                        onClick={() => void onSavePromptPresetSelection("sideChatPromptPresetID")}
                      >
                        {savingPromptPresetSelectionField === "sideChatPromptPresetID" ? "Saving..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="settings-services-layout settings-prompts-layout">
              <div className="settings-service-list-panel settings-prompt-library-panel">
                <div className="settings-prompt-section-bar">
                  <h3>Presets</h3>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isCreatingPromptPreset}
                    onClick={handlePromptPresetCreate}
                  >
                    {isCreatingPromptPreset ? "Creating..." : "New"}
                  </button>
                </div>

                <div className="settings-service-list-body">
                  {promptPresetOptions.length > 0 ? (
                    <div className="settings-service-list settings-prompt-library" role="list" aria-label="Prompt presets">
                      {promptPresetOptions.map((preset) => {
                        const isActive = preset.id === selectedPromptPreset?.id
                        const usageLabels = getPromptPresetUsageLabels(preset.id, promptPresetSelection)

                        return (
                          <button
                            key={preset.id}
                            className={
                              isActive
                                ? "settings-service-item settings-prompt-library-item is-active"
                                : "settings-service-item settings-prompt-library-item"
                            }
                            aria-label={preset.label}
                            aria-pressed={isActive}
                            type="button"
                            onClick={() => handlePromptPresetSelection(preset.id)}
                          >
                            <div className="settings-service-item-header">
                              <strong>{preset.label}</strong>
                              <span className="settings-badge">{getPromptPresetSourceLabel(preset.source)}</span>
                            </div>
                            <div className="settings-prompt-item-statuses">
                              {usageLabels.map((label) => (
                                <span key={`${preset.id}-${label}`} className="settings-badge is-highlight">
                                  {label}
                                </span>
                              ))}
                              {preset.hasOverride ? <span className="settings-badge is-warning">Edited</span> : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <article className="settings-empty-state settings-service-list-empty-state">
                      <h3>No presets</h3>
                    </article>
                  )}
                </div>
              </div>

              <div className="settings-service-detail-panel settings-prompt-detail-panel">
                {selectedPromptPreset ? (
                  <section className="settings-panel settings-prompt-editor-panel">
                    <div className="settings-prompt-editor-header">
                      <div className="settings-prompt-editor-meta">
                        {selectedPromptPreset.source === "custom" ? (
                          <input
                            className="settings-prompt-name-input"
                            aria-label="Preset name"
                            value={promptDraftLabel}
                            readOnly={isLoadingPromptPreset}
                            onChange={(event) => onPromptDraftLabelChange(event.target.value)}
                          />
                        ) : (
                          <h3>{selectedPromptPreset.label}</h3>
                        )}

                        <div className="settings-prompt-item-statuses">
                          <span className="settings-badge">{getPromptPresetSourceLabel(selectedPromptPreset.source)}</span>
                          {selectedPromptPresetUsageLabels.map((label) => (
                            <span key={`${selectedPromptPreset.id}-${label}`} className="settings-badge is-highlight">
                              {label}
                            </span>
                          ))}
                          {selectedPromptPreset.hasOverride ? (
                            <span className="settings-badge is-warning">Edited</span>
                          ) : null}
                          {isLoadingPromptPreset ? <span className="settings-badge">Loading</span> : null}
                        </div>
                      </div>

                      <div className="settings-prompt-editor-toolbar">
                        <div className="settings-prompt-editor-mode-switch" aria-label="Prompt editor mode">
                          <button
                            className={
                              promptEditorMode === "edit"
                                ? "settings-prompt-editor-mode-button is-active"
                                : "settings-prompt-editor-mode-button"
                            }
                            type="button"
                            aria-pressed={promptEditorMode === "edit"}
                            onClick={() => setPromptEditorMode("edit")}
                          >
                            Edit
                          </button>
                          <button
                            className={
                              promptEditorMode === "preview"
                                ? "settings-prompt-editor-mode-button is-active"
                                : "settings-prompt-editor-mode-button"
                            }
                            type="button"
                            aria-pressed={promptEditorMode === "preview"}
                            onClick={() => setPromptEditorMode("preview")}
                          >
                            Preview
                          </button>
                        </div>

                        <div className="settings-inline-actions">
                          {selectedPromptPreset.source === "custom" ? (
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={selectedPromptPresetBusy || isLoadingPromptPreset}
                              onClick={() => void onDeletePromptPreset()}
                            >
                              {deletingPromptPresetID === selectedPromptPreset.id ? "Deleting..." : "Delete"}
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={!selectedPromptPreset.hasOverride || selectedPromptPresetBusy || isLoadingPromptPreset}
                              onClick={() => void onResetPromptPreset()}
                            >
                              {resettingPromptPresetID === selectedPromptPreset.id ? "Resetting..." : "Reset"}
                            </button>
                          )}
                          <button
                            className="primary-button"
                            type="button"
                            disabled={!isPromptDirty || selectedPromptPresetBusy || isLoadingPromptPreset}
                            onClick={() => void onSavePromptPreset()}
                          >
                            {savingPromptPresetID === selectedPromptPreset.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="settings-field settings-prompt-editor-field">
                      {promptEditorMode === "edit" ? (
                        <textarea
                          className="settings-prompt-editor"
                          aria-label={`${selectedPromptPreset.label} content`}
                          value={promptDraftContent}
                          readOnly={!selectedPromptPreset.editable || isLoadingPromptPreset}
                          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptDraftChange(event.target.value)}
                        />
                      ) : (
                        <div
                          className="settings-prompt-preview-surface"
                          role="region"
                          aria-label={`${selectedPromptPreset.label} markdown preview`}
                        >
                          {promptDraftContent.trim() ? (
                            <ThreadMarkdown
                              className="thread-markdown settings-prompt-markdown-preview"
                              text={getPromptMarkdownPreviewText(promptDraftContent)}
                            />
                          ) : (
                            <p className="settings-prompt-preview-empty">No prompt content.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {selectedPromptPreset.sourcePath ? (
                      <p className="settings-helper-text settings-prompt-source-path">
                        <code>{selectedPromptPreset.sourcePath}</code>
                      </p>
                    ) : null}
                  </section>
                ) : (
                  <article className="settings-empty-state settings-detail-empty-state">
                    <h3>Select a preset</h3>
                  </article>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
