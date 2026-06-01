import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"
import {
  ChevronDownIcon,
  CloseIcon,
  DeleteIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
} from "../icons"
import { SettingsSelect } from "../settings/SettingsSelect"
import { ShellTopMenu } from "../shared-ui"
import { ThreadMarkdown } from "../thread-markdown"
import type {
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
  PromptUrlInstallPreview,
} from "../types"

type PromptEditorMode = "edit" | "preview"
type PromptPresetFolderID = PromptPresetSummary["source"]

interface PromptEditorMessage {
  tone: "success" | "error"
  text: string
}

interface PromptPresetsPageProps {
  deletingPromptPresetID: string | null
  isCreatingPromptPreset: boolean
  isInstallingPromptUrlPrompts: boolean
  isLoadingPromptPreset: boolean
  isLoadingPrompts: boolean
  isPreviewingPromptUrlInstall: boolean
  isPromptDirty: boolean
  isPromptUrlInstallDialogOpen: boolean
  isSavingPromptPresetSelection: boolean
  promptDraftContent: string
  promptDraftLabel: string
  promptLoadError: string | null
  promptRoot: string
  promptPresets: PromptPresetSummary[]
  promptPresetSelection: PromptPresetSelection | null
  promptUrlInstallMessage: PromptEditorMessage | null
  promptUrlInstallPreview: PromptUrlInstallPreview | null
  promptUrlInstallSource: string
  resettingPromptPresetID: string | null
  savingPromptPresetID: string | null
  selectedPromptPreset: PromptPresetDocument | null
  selectedPromptUrlInstallIDs: string[]
  hideNavigator?: boolean
  windowControls?: ReactNode
  onCreatePromptPreset: () => boolean | Promise<boolean>
  onDeletePromptPreset: (presetID?: string) => boolean | Promise<boolean>
  onInstallPromptsFromUrl: () => boolean | Promise<boolean>
  onPromptDraftChange: (value: string) => void
  onPromptDraftLabelChange: (value: string) => void
  onPromptPresetSelect: (presetID: string) => boolean | Promise<boolean>
  onPromptPresetSelectionChange: (field: keyof PromptPresetSelection, value: string) => boolean | Promise<boolean>
  onPromptUrlInstallDialogClose: () => void
  onPromptUrlInstallDialogOpen: () => void
  onPromptUrlInstallPromptToggle: (promptID: string) => void
  onPromptUrlInstallSourceChange: (value: string) => void
  onPreviewPromptUrlInstall: () => boolean | Promise<boolean>
  onOpenPromptFolder: () => boolean | Promise<boolean>
  onResetPromptPreset: () => boolean | Promise<boolean>
  onSavePromptPreset: () => boolean | Promise<boolean>
}

export interface PromptPresetsSidebarViewProps {
  deletingPromptPresetID: string | null
  isCreatingPromptPreset: boolean
  isInstallingPromptUrlPrompts: boolean
  isPreviewingPromptUrlInstall: boolean
  isPromptDirty: boolean
  promptRoot: string
  promptPresets: PromptPresetSummary[]
  promptPresetSelection: PromptPresetSelection | null
  selectedPromptPreset: PromptPresetDocument | null
  onCreatePromptPreset: () => boolean | Promise<boolean>
  onDeletePromptPreset: (presetID?: string) => boolean | Promise<boolean>
  onOpenPromptFolder: () => boolean | Promise<boolean>
  onPromptPresetSelect: (presetID: string) => boolean | Promise<boolean>
  onPromptUrlInstallDialogOpen: () => void
}

function getPromptPresetSourceLabel(source: PromptPresetSummary["source"]) {
  return source === "custom" ? "Custom" : "Bundled"
}

function getPromptPresetFolderLabel(source: PromptPresetSummary["source"]) {
  return source === "custom" ? "Custom" : "Bundled"
}

function getPromptPresetPathLabel(preset: PromptPresetSummary) {
  return preset.filePath ?? preset.sourcePath ?? (preset.source === "custom" ? "Custom preset" : "Bundled preset")
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

function normalizePromptSearchTerm(value: string) {
  return value.trim().toLowerCase()
}

function doesPromptPresetMatchSearch(
  preset: PromptPresetSummary,
  normalizedSearchTerm: string,
) {
  if (!normalizedSearchTerm) return true

  return [
    preset.label,
    preset.description,
    preset.id,
    preset.filePath ?? "",
    preset.sourcePath ?? "",
    preset.root ?? "",
    getPromptPresetSourceLabel(preset.source),
  ].some((value) => value.toLowerCase().includes(normalizedSearchTerm))
}

interface PromptUrlInstallDialogProps {
  installMessage: PromptEditorMessage | null
  installPreview: PromptUrlInstallPreview | null
  installSource: string
  isInstalling: boolean
  isPreviewing: boolean
  selectedPromptIDs: string[]
  onClose: () => void
  onInstall: () => boolean | Promise<boolean>
  onPreview: () => boolean | Promise<boolean>
  onSourceChange: (value: string) => void
  onTogglePrompt: (promptID: string) => void
}

function PromptUrlInstallDialog({
  installMessage,
  installPreview,
  installSource,
  isInstalling,
  isPreviewing,
  selectedPromptIDs,
  onClose,
  onInstall,
  onPreview,
  onSourceChange,
  onTogglePrompt,
}: PromptUrlInstallDialogProps) {
  const isBusy = isPreviewing || isInstalling
  const selectedCount = selectedPromptIDs.length

  function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onPreview()
  }

  return (
    <div className="global-skills-git-install-overlay">
      <section className="global-skills-git-install-modal" role="dialog" aria-modal="true" aria-label="Install prompts from URL">
        <header className="global-skills-git-install-header">
          <div>
            <h3>Install Prompts from URL</h3>
            <p>Preview the URL, then select the prompts to install.</p>
          </div>
          <button
            className="row-action global-skills-git-install-close"
            aria-label="Close prompt URL install"
            disabled={isBusy}
            title="Close"
            type="button"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <form className="global-skills-git-install-form" onSubmit={handlePreviewSubmit}>
          <label className="global-skills-git-install-label" htmlFor="prompt-url-install-source">
            URL
          </label>
          <input
            id="prompt-url-install-source"
            className="global-skills-git-install-input"
            aria-label="Prompt resource URL"
            autoComplete="off"
            disabled={isBusy}
            placeholder="github.com/user/repo, GitHub tree URL, or direct .md/.txt URL"
            type="text"
            value={installSource}
            onChange={(event) => onSourceChange(event.target.value)}
          />
          <div className="global-skills-git-install-help">
            <span>Supported formats:</span>
            <code>github.com/user/repo</code>
            <code>https://github.com/user/repo/tree/main/prompts</code>
            <code>https://github.com/user/repo/blob/main/prompts/system.md</code>
            <code>https://example.com/prompts/system.md</code>
          </div>
          <div className="global-skills-git-install-actions">
            <button className="secondary-button" disabled={isBusy || !installSource.trim()} type="submit">
              {isPreviewing ? "Previewing..." : "Preview"}
            </button>
          </div>
        </form>

        {installMessage ? (
          <p className={`global-skills-git-install-message is-${installMessage.tone}`} role={installMessage.tone === "error" ? "alert" : "status"}>
            {installMessage.text}
          </p>
        ) : null}

        {installPreview ? (
          <section className="global-skills-git-install-preview" aria-label="Prompt URL install preview">
            <div className="global-skills-git-install-preview-meta">
              <span>{installPreview.source}</span>
            </div>
            <div className="global-skills-git-install-list">
              {installPreview.prompts.map((prompt) => {
                const checked = selectedPromptIDs.includes(prompt.id)
                return (
                  <label
                    key={prompt.id}
                    className={prompt.available ? "global-skills-git-install-skill" : "global-skills-git-install-skill is-disabled"}
                  >
                    <input
                      checked={checked}
                      disabled={!prompt.available || isBusy}
                      type="checkbox"
                      onChange={() => onTogglePrompt(prompt.id)}
                    />
                    <span className="global-skills-git-install-skill-body">
                      <strong>{prompt.label}</strong>
                      <span>{prompt.description}</span>
                      <code>{prompt.sourcePath}</code>
                      {prompt.reason ? <em>{prompt.reason}</em> : null}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}

        <footer className="global-skills-git-install-footer">
          <button className="secondary-button" disabled={isBusy} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!installPreview || selectedCount === 0 || isBusy}
            type="button"
            onClick={() => void onInstall()}
          >
            {isInstalling ? "Installing..." : `Install${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function PromptPresetsSidebarView({
  deletingPromptPresetID,
  isCreatingPromptPreset,
  isInstallingPromptUrlPrompts,
  isPreviewingPromptUrlInstall,
  isPromptDirty,
  promptRoot,
  promptPresets,
  promptPresetSelection,
  selectedPromptPreset,
  onCreatePromptPreset,
  onDeletePromptPreset,
  onOpenPromptFolder,
  onPromptPresetSelect,
  onPromptUrlInstallDialogOpen,
}: PromptPresetsSidebarViewProps) {
  const [promptSearchTerm, setPromptSearchTerm] = useState("")
  const [isInstallMenuOpen, setIsInstallMenuOpen] = useState(false)
  const installMenuRef = useRef<HTMLDivElement | null>(null)
  const [expandedPromptPresetFolders, setExpandedPromptPresetFolders] = useState<PromptPresetFolderID[]>([
    "bundled",
    "custom",
  ])
  const promptPresetOptions = [...promptPresets].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "bundled" ? -1 : 1
    }

    return left.label.localeCompare(right.label)
  })
  const normalizedPromptSearchTerm = normalizePromptSearchTerm(promptSearchTerm)
  const promptPresetFolderDefinitions: Array<{
    id: PromptPresetFolderID
    label: string
    presets: PromptPresetSummary[]
  }> = [
    {
      id: "bundled",
      label: getPromptPresetFolderLabel("bundled"),
      presets: promptPresetOptions.filter((preset) => preset.source === "bundled"),
    },
    {
      id: "custom",
      label: getPromptPresetFolderLabel("custom"),
      presets: promptPresetOptions.filter((preset) => preset.source === "custom"),
    },
  ]
  const promptPresetFolders = promptPresetFolderDefinitions.map((folder) => ({
    ...folder,
    presets: folder.presets.filter((preset) =>
      doesPromptPresetMatchSearch(preset, normalizedPromptSearchTerm),
    ),
  }))
  const visiblePromptPresetFolders = promptPresetFolders.filter((folder) =>
    normalizedPromptSearchTerm ? folder.presets.length > 0 : true,
  )
  const isPromptSearchActive = normalizedPromptSearchTerm.length > 0
  const isInstallButtonDisabled = isCreatingPromptPreset || isPreviewingPromptUrlInstall || isInstallingPromptUrlPrompts

  useEffect(() => {
    if (!isInstallMenuOpen) return

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (installMenuRef.current?.contains(event.target as Node | null)) return
      setIsInstallMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      setIsInstallMenuOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isInstallMenuOpen])

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

  function handleInstallMenuToggle() {
    if (isInstallButtonDisabled) return
    setIsInstallMenuOpen((current) => !current)
  }

  function handleInstallFromUrl() {
    setIsInstallMenuOpen(false)
    onPromptUrlInstallDialogOpen()
  }

  function handlePromptFolderToggle(folderID: PromptPresetFolderID) {
    if (isPromptSearchActive) return
    setExpandedPromptPresetFolders((current) =>
      current.includes(folderID)
        ? current.filter((item) => item !== folderID)
        : [...current, folderID],
    )
  }

  return (
    <section className="sidebar-view sidebar-view-prompts" aria-label="Prompt presets sidebar view">
      <div className="settings-prompt-section-bar prompt-presets-navigator-bar global-skills-section-bar">
        <div className="prompt-presets-navigator-actions global-skills-section-actions">
          <button
            className="secondary-button global-skills-open-folder-button prompt-presets-open-button"
            type="button"
            aria-label="Open prompts folder"
            title={promptRoot || "Prompts folder"}
            disabled={!promptRoot.trim()}
            onClick={() => void onOpenPromptFolder()}
          >
            <FolderIcon />
            <span>打开文件位置</span>
          </button>
          <div className="global-skills-install-menu-shell" ref={installMenuRef}>
            <button
              className={
                isInstallMenuOpen
                  ? "secondary-button global-skills-install-button prompt-presets-install-button is-open"
                  : "secondary-button global-skills-install-button prompt-presets-install-button"
              }
              aria-expanded={isInstallMenuOpen}
              aria-haspopup="menu"
              aria-label="Install prompt"
              disabled={isInstallButtonDisabled}
              title="Install prompt"
              type="button"
              onClick={handleInstallMenuToggle}
            >
              <DownloadIcon />
              <span>{isInstallingPromptUrlPrompts ? "Installing..." : "Install"}</span>
              <ChevronDownIcon />
            </button>
            {isInstallMenuOpen ? (
              <div
                className="global-skills-install-menu prompt-presets-install-menu"
                role="menu"
                aria-label="Install prompt options"
              >
                <button
                  className="global-skills-install-menu-item"
                  role="menuitem"
                  type="button"
                  onClick={handleInstallFromUrl}
                >
                  From URL
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="skills-tree-root prompt-presets-tree" role="list" aria-label="Prompt presets">
        <div className="skills-tree-search-row" aria-label="Prompt presets search" role="search">
          <SearchIcon />
          <input
            aria-label="Search prompts"
            placeholder="搜索 prompts"
            type="search"
            value={promptSearchTerm}
            onChange={(event) => setPromptSearchTerm(event.target.value)}
          />
          {promptSearchTerm.trim() ? (
            <button
              aria-label="Clear prompt search"
              title="Clear"
              type="button"
              onClick={() => setPromptSearchTerm("")}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>

        {visiblePromptPresetFolders.length > 0 ? (
          visiblePromptPresetFolders.map((folder) => {
            const isExpanded = isPromptSearchActive || expandedPromptPresetFolders.includes(folder.id)

            return (
              <div key={folder.id} className="skill-tree-item prompt-tree-folder">
                <div className="skill-tree-row-shell">
                  <button
                    className="skill-tree-row"
                    aria-expanded={isExpanded}
                    aria-label={`${folder.label} prompt folder`}
                    type="button"
                    onClick={() => handlePromptFolderToggle(folder.id)}
                  >
                    <span className="skill-tree-role-icon is-folder" aria-hidden="true">
                      {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
                    </span>
                    <span className="skill-tree-label">{folder.label}</span>
                    <span className="prompt-tree-count">{folder.presets.length}</span>
                  </button>
                </div>

                {isExpanded ? (
                  <div className="skill-tree-children">
                    {folder.presets.length > 0 ? (
                      folder.presets.map((preset) => {
                        const isActive = preset.id === selectedPromptPreset?.id
                        const usageLabels = getPromptPresetUsageLabels(preset.id, promptPresetSelection)
                        const isDeleting = deletingPromptPresetID === preset.id

                        return (
                          <div key={preset.id} className="skill-tree-item skill-tree-item-file prompt-tree-file">
                            <div className="skill-tree-row-shell">
                              <button
                                className={isActive ? "skill-tree-row is-active" : "skill-tree-row"}
                                aria-label={preset.label}
                                aria-pressed={isActive}
                                title={getPromptPresetPathLabel(preset)}
                                type="button"
                                onClick={() => handlePromptPresetSelection(preset.id)}
                              >
                                <span className="skill-tree-role-icon is-skill" aria-hidden="true">
                                  <FileTextIcon />
                                </span>
                                <span className="skill-tree-label">{preset.label}</span>
                                <span className="prompt-tree-row-badges" aria-hidden="true">
                                  {usageLabels.map((label) => (
                                    <span key={`${preset.id}-${label}`} className="settings-badge is-highlight">
                                      {label}
                                    </span>
                                  ))}
                                  {preset.hasOverride ? <span className="settings-badge is-warning">Edited</span> : null}
                                </span>
                              </button>
                              {preset.source === "custom" ? (
                                <button
                                  className="row-action skill-tree-row-action prompt-tree-delete-button"
                                  aria-label={`Delete prompt ${preset.label}`}
                                  disabled={deletingPromptPresetID !== null}
                                  title={isDeleting ? `Deleting ${preset.label}` : `Delete ${preset.label}`}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void onDeletePromptPreset(preset.id)
                                  }}
                                >
                                  <DeleteIcon />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <p className="skills-tree-empty prompt-tree-empty">
                        {folder.id === "custom" ? "No custom prompts yet." : "No bundled prompts."}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })
        ) : promptPresetOptions.length > 0 ? (
          <p className="skills-tree-empty">No prompts match your search.</p>
        ) : (
          <p className="skills-tree-empty">No prompt files found.</p>
        )}

        <div className="global-skills-new-menu-shell prompt-presets-new-menu-shell">
          <button
            className="global-skills-new-button prompt-presets-new-button"
            type="button"
            aria-label="New"
            disabled={isCreatingPromptPreset}
            title={isCreatingPromptPreset ? "Creating..." : "New prompt"}
            onClick={handlePromptPresetCreate}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    </section>
  )
}

export function PromptPresetsPage({
  deletingPromptPresetID,
  isCreatingPromptPreset,
  isInstallingPromptUrlPrompts,
  isLoadingPromptPreset,
  isLoadingPrompts,
  isPreviewingPromptUrlInstall,
  isPromptDirty,
  isPromptUrlInstallDialogOpen,
  isSavingPromptPresetSelection,
  promptDraftContent,
  promptDraftLabel,
  promptLoadError,
  promptRoot,
  promptPresets,
  promptPresetSelection,
  promptUrlInstallMessage,
  promptUrlInstallPreview,
  promptUrlInstallSource,
  resettingPromptPresetID,
  savingPromptPresetID,
  selectedPromptPreset,
  selectedPromptUrlInstallIDs,
  hideNavigator = false,
  windowControls,
  onCreatePromptPreset,
  onDeletePromptPreset,
  onInstallPromptsFromUrl,
  onPromptDraftChange,
  onPromptDraftLabelChange,
  onPromptPresetSelect,
  onPromptPresetSelectionChange,
  onPromptUrlInstallDialogClose,
  onPromptUrlInstallDialogOpen,
  onPromptUrlInstallPromptToggle,
  onPromptUrlInstallSourceChange,
  onPreviewPromptUrlInstall,
  onOpenPromptFolder,
  onResetPromptPreset,
  onSavePromptPreset,
}: PromptPresetsPageProps) {
  const [promptEditorMode, setPromptEditorMode] = useState<PromptEditorMode>("edit")
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
  const promptPresetSelectOptions = promptPresetOptions.map((preset) => ({
    value: preset.id,
    label: preset.label,
  }))

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
          <section className={hideNavigator ? "settings-prompts-shell is-sidebar-hosted" : "settings-prompts-shell"} aria-label="Prompt preset layout">
            <section className="settings-panel settings-prompt-slots-panel">
              <div className="settings-prompt-assignment-list">
                <div className="settings-prompt-assignment-row">
                  <div className="settings-prompt-assignment-copy">
                    <span className="settings-prompt-assignment-title">System</span>
                    <span className="settings-prompt-assignment-note">Every turn</span>
                  </div>

                  <div className="settings-prompt-assignment-control">
                    <div className="settings-prompt-assignment-actions">
                      <SettingsSelect
                        ariaLabel="System prompt preset"
                        className="settings-prompt-assignment-select"
                        options={promptPresetSelectOptions}
                        value={promptPresetSelection?.systemPromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(value) =>
                          void onPromptPresetSelectionChange("systemPromptPresetID", value)
                        }
                      />
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
                      <SettingsSelect
                        ariaLabel="Plan mode prompt preset"
                        className="settings-prompt-assignment-select"
                        options={promptPresetSelectOptions}
                        value={promptPresetSelection?.planModePromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(value) =>
                          void onPromptPresetSelectionChange("planModePromptPresetID", value)
                        }
                      />
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
                      <SettingsSelect
                        ariaLabel="Side chat prompt preset"
                        className="settings-prompt-assignment-select"
                        options={promptPresetSelectOptions}
                        value={promptPresetSelection?.sideChatPromptPresetID ?? ""}
                        disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                        onChange={(value) =>
                          void onPromptPresetSelectionChange("sideChatPromptPresetID", value)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className={hideNavigator ? "settings-services-layout settings-prompts-layout is-sidebar-hosted" : "settings-services-layout settings-prompts-layout"}>
              {!hideNavigator ? (
                <div className="settings-service-list-panel settings-prompt-library-panel">
                  <PromptPresetsSidebarView
                    deletingPromptPresetID={deletingPromptPresetID}
                    isCreatingPromptPreset={isCreatingPromptPreset}
                    isInstallingPromptUrlPrompts={isInstallingPromptUrlPrompts}
                    isPreviewingPromptUrlInstall={isPreviewingPromptUrlInstall}
                    isPromptDirty={isPromptDirty}
                    promptRoot={promptRoot}
                    promptPresets={promptPresets}
                    promptPresetSelection={promptPresetSelection}
                    selectedPromptPreset={selectedPromptPreset}
                    onCreatePromptPreset={onCreatePromptPreset}
                    onDeletePromptPreset={onDeletePromptPreset}
                    onOpenPromptFolder={onOpenPromptFolder}
                    onPromptPresetSelect={onPromptPresetSelect}
                    onPromptUrlInstallDialogOpen={onPromptUrlInstallDialogOpen}
                  />
                </div>
              ) : null}

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

      {isPromptUrlInstallDialogOpen ? (
        <PromptUrlInstallDialog
          installMessage={promptUrlInstallMessage}
          installPreview={promptUrlInstallPreview}
          installSource={promptUrlInstallSource}
          isInstalling={isInstallingPromptUrlPrompts}
          isPreviewing={isPreviewingPromptUrlInstall}
          selectedPromptIDs={selectedPromptUrlInstallIDs}
          onClose={onPromptUrlInstallDialogClose}
          onInstall={onInstallPromptsFromUrl}
          onPreview={onPreviewPromptUrlInstall}
          onSourceChange={onPromptUrlInstallSourceChange}
          onTogglePrompt={onPromptUrlInstallPromptToggle}
        />
      ) : null}
    </section>
  )
}
