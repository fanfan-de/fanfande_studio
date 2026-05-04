import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import { GlobalSkillsCanvas } from "../canvas/CreateSessionCanvas"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  PlusIcon,
} from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type { GlobalSkillTreeNode, SkillGitInstallPreview } from "../types"

interface GlobalSkillsPageProps {
  creatingGlobalSkillName: string
  deletingGlobalSkillDirectory: string | null
  expandedSkillPaths: string[]
  globalSkillsMessage: {
    tone: "success" | "error"
    text: string
  } | null
  globalSkillsRoot: string
  globalSkillsTree: GlobalSkillTreeNode[]
  gitInstallMessage: {
    tone: "success" | "error"
    text: string
  } | null
  gitInstallPreview: SkillGitInstallPreview | null
  gitInstallSource: string
  isCreateGlobalSkillDraftVisible: boolean
  isCreatingGlobalSkill: boolean
  isDirty: boolean
  isGitInstallDialogOpen: boolean
  isInstallingGitSkills: boolean
  isLoadingFile: boolean
  isLoadingSkillsTree: boolean
  isPreviewingGitInstall: boolean
  isSavingFile: boolean
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedFileContent: string
  selectedFilePath: string | null
  selectedGitInstallSkillIDs: string[]
  selectedSkillDirectoryName: string | null
  windowControls?: ReactNode
  onChange: (value: string) => void
  onCreateGlobalSkill: () => void | Promise<void>
  onCreateGlobalSkillDraftCancel: () => void
  onCreateGlobalSkillDraftChange: (value: string) => void
  onCreateGlobalSkillDraftStart: () => void
  onDelete: () => void | Promise<void>
  onDeleteGlobalSkill: (directoryPath?: string) => void | Promise<void>
  onGitInstallDialogClose: () => void
  onGitInstallDialogOpen: () => void
  onGitInstallSkillToggle: (skillID: string) => void
  onGitInstallSourceChange: (value: string) => void
  onGlobalSkillDirectoryToggle: (path: string) => void
  onGlobalSkillFileSelect: (path: string) => void | Promise<void>
  onInstallGitSkills: () => void | Promise<void>
  onOpenGlobalSkillsFolder: () => void | Promise<void>
  onPreviewGitSkillInstall: () => void | Promise<void>
  onRenameGlobalSkill: () => void | Promise<void>
  onRenameGlobalSkillDraftCancel: () => void
  onRenameGlobalSkillDraftChange: (value: string) => void
  onRenameGlobalSkillDraftStart: (directoryPath: string) => void
  onSave: () => void | Promise<void>
}

interface GlobalSkillsNavigatorProps {
  creatingGlobalSkillName: string
  deletingGlobalSkillDirectory: string | null
  expandedSkillPaths: string[]
  globalSkillsRoot: string
  globalSkillsTree: GlobalSkillTreeNode[]
  isCreateGlobalSkillDraftVisible: boolean
  isCreatingGlobalSkill: boolean
  isLoadingSkillsTree: boolean
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedGlobalSkillFilePath: string | null
  onCreateGlobalSkill: () => void | Promise<void>
  onCreateGlobalSkillDraftCancel: () => void
  onCreateGlobalSkillDraftChange: (value: string) => void
  onCreateGlobalSkillDraftStart: () => void
  onDeleteGlobalSkill: (directoryPath?: string) => void | Promise<void>
  onGitInstallDialogOpen: () => void
  onGlobalSkillDirectoryToggle: (path: string) => void
  onGlobalSkillFileSelect: (path: string) => void | Promise<void>
  onOpenGlobalSkillsFolder: () => void | Promise<void>
  onRenameGlobalSkill: () => void | Promise<void>
  onRenameGlobalSkillDraftCancel: () => void
  onRenameGlobalSkillDraftChange: (value: string) => void
  onRenameGlobalSkillDraftStart: (directoryPath: string) => void
}

interface GlobalSkillGitInstallDialogProps {
  gitInstallMessage: {
    tone: "success" | "error"
    text: string
  } | null
  gitInstallPreview: SkillGitInstallPreview | null
  gitInstallSource: string
  isInstallingGitSkills: boolean
  isPreviewingGitInstall: boolean
  selectedGitInstallSkillIDs: string[]
  onClose: () => void
  onInstall: () => void | Promise<void>
  onPreview: () => void | Promise<void>
  onSourceChange: (value: string) => void
  onToggleSkill: (skillID: string) => void
}

function GlobalSkillsTreeNodeRow({
  deletingGlobalSkillDirectory,
  depth = 0,
  expandedSkillPaths,
  node,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedGlobalSkillFilePath,
  onDeleteGlobalSkill,
  onDirectoryToggle,
  onFileSelect,
  onRenameGlobalSkill,
  onRenameGlobalSkillDraftCancel,
  onRenameGlobalSkillDraftChange,
  onRenameGlobalSkillDraftStart,
}: {
  deletingGlobalSkillDirectory: string | null
  depth?: number
  expandedSkillPaths: string[]
  node: GlobalSkillTreeNode
  renamingGlobalSkillDirectory: string | null
  renamingGlobalSkillDraftDirectory: string | null
  renamingGlobalSkillName: string
  selectedGlobalSkillFilePath: string | null
  onDeleteGlobalSkill: (directoryPath?: string) => void | Promise<void>
  onDirectoryToggle: (path: string) => void
  onFileSelect: (path: string) => void | Promise<void>
  onRenameGlobalSkill: () => void | Promise<void>
  onRenameGlobalSkillDraftCancel: () => void
  onRenameGlobalSkillDraftChange: (value: string) => void
  onRenameGlobalSkillDraftStart: (directoryPath: string) => void
}) {
  if (node.kind === "file") {
    const isActive = node.path === selectedGlobalSkillFilePath

    return (
      <div className="skill-tree-item skill-tree-item-file">
        <button
          className={isActive ? "skill-tree-row is-active" : "skill-tree-row"}
          title={node.path}
          type="button"
          onClick={() => void onFileSelect(node.path)}
        >
          <span className="skill-tree-leading" aria-hidden="true">
            <FileTextIcon />
          </span>
          <span className="skill-tree-label">{node.name}</span>
        </button>
      </div>
    )
  }

  const isExpanded = expandedSkillPaths.includes(node.path)
  const showDeleteAction = depth === 0
  const isRenameDraftVisible = depth === 0 && renamingGlobalSkillDraftDirectory === node.path
  const isRenamePending = renamingGlobalSkillDirectory === node.path

  function handleDirectoryDoubleClick(event: MouseEvent<HTMLButtonElement>) {
    if (depth !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onRenameGlobalSkillDraftStart(node.path)
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onRenameGlobalSkill()
  }

  function handleRenameInputBlur(event: FocusEvent<HTMLInputElement>) {
    if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return
    onRenameGlobalSkillDraftCancel()
  }

  function handleRenameInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      void onRenameGlobalSkill()
      return
    }

    if (event.key !== "Escape") return
    event.preventDefault()
    onRenameGlobalSkillDraftCancel()
  }

  return (
    <div className="skill-tree-item">
      <div className="skill-tree-row-shell">
        {isRenameDraftVisible ? (
          <form className="skill-tree-rename-form" aria-label={`Rename skill ${node.name}`} onSubmit={handleRenameSubmit}>
            <span className="skill-tree-leading" aria-hidden="true">
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
            <input
              autoFocus
              className="skill-tree-rename-input"
              aria-label={`Rename global skill ${node.name}`}
              disabled={isRenamePending}
              type="text"
              value={renamingGlobalSkillName}
              onBlur={handleRenameInputBlur}
              onChange={(event) => onRenameGlobalSkillDraftChange(event.target.value)}
              onKeyDown={handleRenameInputKeyDown}
            />
          </form>
        ) : (
          <button
            className="skill-tree-row"
            aria-expanded={isExpanded}
            title={depth === 0 ? `${node.path}\nDouble-click to rename` : node.path}
            type="button"
            onClick={() => onDirectoryToggle(node.path)}
            onDoubleClick={handleDirectoryDoubleClick}
          >
            <span className="skill-tree-leading" aria-hidden="true">
              {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
            <span className="skill-tree-label">{node.name}</span>
          </button>
        )}
        {showDeleteAction ? (
          <button
            className="row-action skill-tree-row-action"
            aria-label={`Delete skill ${node.name}`}
            disabled={deletingGlobalSkillDirectory === node.path || isRenameDraftVisible || isRenamePending}
            title={`Delete skill ${node.name}`}
            type="button"
            onClick={() => void onDeleteGlobalSkill(node.path)}
          >
            <DeleteIcon />
          </button>
        ) : null}
      </div>

      {isExpanded && node.children?.length ? (
        <div className="skill-tree-children">
          {node.children.map((child) => (
            <GlobalSkillsTreeNodeRow
              key={child.path}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              depth={depth + 1}
              expandedSkillPaths={expandedSkillPaths}
              node={child}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
              onDeleteGlobalSkill={onDeleteGlobalSkill}
              onDirectoryToggle={onDirectoryToggle}
              onFileSelect={onFileSelect}
              onRenameGlobalSkill={onRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function GlobalSkillsNavigator({
  creatingGlobalSkillName,
  deletingGlobalSkillDirectory,
  expandedSkillPaths,
  globalSkillsRoot,
  globalSkillsTree,
  isCreateGlobalSkillDraftVisible,
  isCreatingGlobalSkill,
  isLoadingSkillsTree,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedGlobalSkillFilePath,
  onCreateGlobalSkill,
  onCreateGlobalSkillDraftCancel,
  onCreateGlobalSkillDraftChange,
  onCreateGlobalSkillDraftStart,
  onDeleteGlobalSkill,
  onGitInstallDialogOpen,
  onGlobalSkillDirectoryToggle,
  onGlobalSkillFileSelect,
  onOpenGlobalSkillsFolder,
  onRenameGlobalSkill,
  onRenameGlobalSkillDraftCancel,
  onRenameGlobalSkillDraftChange,
  onRenameGlobalSkillDraftStart,
}: GlobalSkillsNavigatorProps) {
  function handleCreateSkillSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onCreateGlobalSkill()
  }

  function handleCreateSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return
    event.preventDefault()
    onCreateGlobalSkillDraftCancel()
  }

  return (
    <section className="global-skills-navigator" aria-label="Global skills library">
      <div className="settings-prompt-section-bar global-skills-section-bar">
        <div className="global-skills-section-actions">
          <button
            className="secondary-button global-skills-open-folder-button"
            aria-label="打开文件位置"
            disabled={!globalSkillsRoot}
            title={globalSkillsRoot ? `打开文件位置: ${globalSkillsRoot}` : "Skills folder is loading"}
            type="button"
            onClick={() => void onOpenGlobalSkillsFolder()}
          >
            <FolderIcon />
            <span>打开文件位置</span>
          </button>
          <button
            className="secondary-button global-skills-install-button"
            aria-label="Install skill from Git"
            disabled={isCreatingGlobalSkill || isCreateGlobalSkillDraftVisible || Boolean(renamingGlobalSkillDraftDirectory || renamingGlobalSkillDirectory)}
            title="Install skill from Git"
            type="button"
            onClick={onGitInstallDialogOpen}
          >
            <DownloadIcon />
            <span>Install</span>
          </button>
        </div>
      </div>

      <div className="skills-tree-root">
        {isLoadingSkillsTree && globalSkillsTree.length === 0 ? (
          <p className="skills-tree-empty">Loading skills...</p>
        ) : globalSkillsTree.length > 0 ? (
          globalSkillsTree.map((node) => (
            <GlobalSkillsTreeNodeRow
              key={node.path}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              expandedSkillPaths={expandedSkillPaths}
              node={node}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedGlobalSkillFilePath}
              onDeleteGlobalSkill={onDeleteGlobalSkill}
              onDirectoryToggle={onGlobalSkillDirectoryToggle}
              onFileSelect={onGlobalSkillFileSelect}
              onRenameGlobalSkill={onRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
            />
          ))
        ) : (
          <p className="skills-tree-empty">No skills exist yet. Use + to create the first one.</p>
        )}

        {isCreateGlobalSkillDraftVisible ? (
          <form className="skills-create-form" aria-label="Create global skill form" onSubmit={handleCreateSkillSubmit}>
            <input
              autoFocus
              className="skills-create-input"
              aria-label="New global skill name"
              disabled={isCreatingGlobalSkill}
              placeholder="new-skill"
              type="text"
              value={creatingGlobalSkillName}
              onChange={(event) => onCreateGlobalSkillDraftChange(event.target.value)}
              onKeyDown={handleCreateSkillKeyDown}
            />
            <div className="skills-create-actions">
              <button disabled={isCreatingGlobalSkill} type="submit">
                Create
              </button>
              <button disabled={isCreatingGlobalSkill} type="button" onClick={onCreateGlobalSkillDraftCancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="secondary-button global-skills-new-button"
            aria-label="Create global skill"
            disabled={isCreatingGlobalSkill || Boolean(renamingGlobalSkillDraftDirectory || renamingGlobalSkillDirectory)}
            title="Create global skill"
            type="button"
            onClick={onCreateGlobalSkillDraftStart}
          >
            <PlusIcon />
          </button>
        )}
      </div>
    </section>
  )
}

function GlobalSkillGitInstallDialog({
  gitInstallMessage,
  gitInstallPreview,
  gitInstallSource,
  isInstallingGitSkills,
  isPreviewingGitInstall,
  selectedGitInstallSkillIDs,
  onClose,
  onInstall,
  onPreview,
  onSourceChange,
  onToggleSkill,
}: GlobalSkillGitInstallDialogProps) {
  const isBusy = isPreviewingGitInstall || isInstallingGitSkills
  const selectedCount = selectedGitInstallSkillIDs.length

  function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onPreview()
  }

  return (
    <div className="global-skills-git-install-overlay">
      <section className="global-skills-git-install-modal" role="dialog" aria-modal="true" aria-label="Install skills from Git">
        <header className="global-skills-git-install-header">
          <div>
            <h3>Install Skills from Git</h3>
            <p>Preview the repository, then select the skills to install.</p>
          </div>
          <button
            className="row-action global-skills-git-install-close"
            aria-label="Close Git skill install"
            disabled={isBusy}
            title="Close"
            type="button"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <form className="global-skills-git-install-form" onSubmit={handlePreviewSubmit}>
          <label className="global-skills-git-install-label" htmlFor="global-skills-git-source">
            Repository
          </label>
          <input
            id="global-skills-git-source"
            className="global-skills-git-install-input"
            aria-label="Git skill repository"
            disabled={isBusy}
            placeholder="user/repo or https://github.com/user/repo"
            type="text"
            value={gitInstallSource}
            onChange={(event) => onSourceChange(event.target.value)}
          />
          <div className="global-skills-git-install-help">
            <span>Supported formats:</span>
            <code>user/repo</code>
            <code>https://github.com/user/repo</code>
            <code>https://github.com/user/repo/tree/main/skills/my-skill</code>
            <code>git@github.com:user/repo.git</code>
          </div>
          <div className="global-skills-git-install-actions">
            <button className="secondary-button" disabled={isBusy || !gitInstallSource.trim()} type="submit">
              {isPreviewingGitInstall ? "Previewing..." : "Preview"}
            </button>
          </div>
        </form>

        {gitInstallMessage ? (
          <p className={`global-skills-git-install-message is-${gitInstallMessage.tone}`} role={gitInstallMessage.tone === "error" ? "alert" : "status"}>
            {gitInstallMessage.text}
          </p>
        ) : null}

        {gitInstallPreview ? (
          <section className="global-skills-git-install-preview" aria-label="Git skill install preview">
            <div className="global-skills-git-install-preview-meta">
              <span>{gitInstallPreview.cloneUrl}</span>
              {gitInstallPreview.ref ? <span>branch: {gitInstallPreview.ref}</span> : null}
              {gitInstallPreview.subpath ? <span>path: {gitInstallPreview.subpath}</span> : null}
            </div>
            <div className="global-skills-git-install-list">
              {gitInstallPreview.skills.map((skill) => {
                const checked = selectedGitInstallSkillIDs.includes(skill.id)
                return (
                  <label
                    key={skill.id}
                    className={skill.available ? "global-skills-git-install-skill" : "global-skills-git-install-skill is-disabled"}
                  >
                    <input
                      checked={checked}
                      disabled={!skill.available || isBusy}
                      type="checkbox"
                      onChange={() => onToggleSkill(skill.id)}
                    />
                    <span className="global-skills-git-install-skill-body">
                      <strong>{skill.name}</strong>
                      <span>{skill.description}</span>
                      <code>{skill.relativePath}</code>
                      {skill.reason ? <em>{skill.reason}</em> : null}
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
            disabled={!gitInstallPreview || selectedCount === 0 || isBusy}
            type="button"
            onClick={() => void onInstall()}
          >
            {isInstallingGitSkills ? "Installing..." : `Install${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function GlobalSkillsPage({
  creatingGlobalSkillName,
  deletingGlobalSkillDirectory,
  expandedSkillPaths,
  globalSkillsMessage,
  globalSkillsRoot,
  globalSkillsTree,
  gitInstallMessage,
  gitInstallPreview,
  gitInstallSource,
  isCreateGlobalSkillDraftVisible,
  isCreatingGlobalSkill,
  isDirty,
  isGitInstallDialogOpen,
  isInstallingGitSkills,
  isLoadingFile,
  isLoadingSkillsTree,
  isPreviewingGitInstall,
  isSavingFile,
  renamingGlobalSkillDirectory,
  renamingGlobalSkillDraftDirectory,
  renamingGlobalSkillName,
  selectedFileContent,
  selectedFilePath,
  selectedGitInstallSkillIDs,
  selectedSkillDirectoryName,
  windowControls,
  onChange,
  onCreateGlobalSkill,
  onCreateGlobalSkillDraftCancel,
  onCreateGlobalSkillDraftChange,
  onCreateGlobalSkillDraftStart,
  onDelete,
  onDeleteGlobalSkill,
  onGitInstallDialogClose,
  onGitInstallDialogOpen,
  onGitInstallSkillToggle,
  onGitInstallSourceChange,
  onGlobalSkillDirectoryToggle,
  onGlobalSkillFileSelect,
  onInstallGitSkills,
  onOpenGlobalSkillsFolder,
  onPreviewGitSkillInstall,
  onRenameGlobalSkill,
  onRenameGlobalSkillDraftCancel,
  onRenameGlobalSkillDraftChange,
  onRenameGlobalSkillDraftStart,
  onSave,
}: GlobalSkillsPageProps) {
  return (
    <section className="global-skills-page" aria-label="Global skills">
      <ShellTopMenu
        as="header"
        ariaLabel="Skills top menu"
        className="canvas-region-top-menu global-skills-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="prompt-presets-top-menu-label">
            <FileTextIcon />
            <span>Skills</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div className="settings-page-main is-services global-skills-page-main">
        <section className="settings-services-layout global-skills-page-layout" aria-label="Global skill layout">
          <div className="settings-service-list-panel global-skills-library-panel">
            <GlobalSkillsNavigator
              creatingGlobalSkillName={creatingGlobalSkillName}
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              expandedSkillPaths={expandedSkillPaths}
              globalSkillsRoot={globalSkillsRoot}
              globalSkillsTree={globalSkillsTree}
              isCreateGlobalSkillDraftVisible={isCreateGlobalSkillDraftVisible}
              isCreatingGlobalSkill={isCreatingGlobalSkill}
              isLoadingSkillsTree={isLoadingSkillsTree}
              renamingGlobalSkillDirectory={renamingGlobalSkillDirectory}
              renamingGlobalSkillDraftDirectory={renamingGlobalSkillDraftDirectory}
              renamingGlobalSkillName={renamingGlobalSkillName}
              selectedGlobalSkillFilePath={selectedFilePath}
              onCreateGlobalSkill={onCreateGlobalSkill}
              onCreateGlobalSkillDraftCancel={onCreateGlobalSkillDraftCancel}
              onCreateGlobalSkillDraftChange={onCreateGlobalSkillDraftChange}
              onCreateGlobalSkillDraftStart={onCreateGlobalSkillDraftStart}
              onDeleteGlobalSkill={onDeleteGlobalSkill}
              onGitInstallDialogOpen={onGitInstallDialogOpen}
              onGlobalSkillDirectoryToggle={onGlobalSkillDirectoryToggle}
              onGlobalSkillFileSelect={onGlobalSkillFileSelect}
              onOpenGlobalSkillsFolder={onOpenGlobalSkillsFolder}
              onRenameGlobalSkill={onRenameGlobalSkill}
              onRenameGlobalSkillDraftCancel={onRenameGlobalSkillDraftCancel}
              onRenameGlobalSkillDraftChange={onRenameGlobalSkillDraftChange}
              onRenameGlobalSkillDraftStart={onRenameGlobalSkillDraftStart}
            />
          </div>

          <div className="settings-service-detail-panel global-skills-detail-panel">
            <GlobalSkillsCanvas
              deletingGlobalSkillDirectory={deletingGlobalSkillDirectory}
              globalSkillsMessage={globalSkillsMessage}
              globalSkillsRoot={globalSkillsRoot}
              isDirty={isDirty}
              isLoadingFile={isLoadingFile}
              isSavingFile={isSavingFile}
              selectedFileContent={selectedFileContent}
              selectedFilePath={selectedFilePath}
              selectedSkillDirectoryName={selectedSkillDirectoryName}
              onChange={onChange}
              onDelete={onDelete}
              onSave={onSave}
            />
          </div>
        </section>
      </div>

      {isGitInstallDialogOpen ? (
        <GlobalSkillGitInstallDialog
          gitInstallMessage={gitInstallMessage}
          gitInstallPreview={gitInstallPreview}
          gitInstallSource={gitInstallSource}
          isInstallingGitSkills={isInstallingGitSkills}
          isPreviewingGitInstall={isPreviewingGitInstall}
          selectedGitInstallSkillIDs={selectedGitInstallSkillIDs}
          onClose={onGitInstallDialogClose}
          onInstall={onInstallGitSkills}
          onPreview={onPreviewGitSkillInstall}
          onSourceChange={onGitInstallSourceChange}
          onToggleSkill={onGitInstallSkillToggle}
        />
      ) : null}
    </section>
  )
}
